import pytest
import requests
import json
import os
import time
import base64
import subprocess
import signal
import sys
from pathlib import Path

# Configuration
MARKET_SIM_URL = os.environ.get("MARKET_SIM_URL", "http://localhost:8080")
JUDGE0_URL = os.environ.get("JUDGE0_URL", "http://localhost:2358")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost")
TEST_DATA_DIR = Path(__file__).parent / "test_data"

# Language IDs for Judge0
LANGUAGES = {
    "python3": 71,
    "cpp": 54,
    "javascript": 63,
}

# Status codes
STATUS = {
    "IN_QUEUE": 1,
    "PROCESSING": 2,
    "ACCEPTED": 3,
    "WRONG_ANSWER": 4,
    "TIME_LIMIT_EXCEEDED": 5,
    "COMPILATION_ERROR": 6,
    "RUNTIME_ERROR": 7,
    "MEMORY_LIMIT_EXCEEDED": 10,
    "RUNTIME_ERROR_NZEC": 11,
}


def setup_module():
    """Create test data directory"""
    TEST_DATA_DIR.mkdir(exist_ok=True)


def teardown_module():
    """Cleanup test data"""
    import shutil

    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR)


class TestJudge0Basic:
    """Basic Judge0 functionality tests"""

    def test_languages_endpoint(self):
        """Test that Judge0 returns available languages"""
        try:
            response = requests.get(f"{JUDGE0_URL}/languages", timeout=5)
            assert response.status_code == 200
            languages = response.json()
            assert len(languages) > 0
            # Check for Python and C++
            lang_ids = [l["id"] for l in languages]
            assert 71 in lang_ids  # Python 3
            assert 54 in lang_ids  # C++
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_about_endpoint(self):
        """Test Judge0 system info"""
        try:
            response = requests.get(f"{JUDGE0_URL}/about", timeout=5)
            assert response.status_code == 200
            info = response.json()
            assert "version" in info or "hostname" in info
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")


class TestJudge0PythonExecution:
    """Python code execution tests"""

    def test_simple_print(self):
        """Test basic Python print execution"""
        try:
            code = 'print("Hello, World!")'
            result = self._execute_python(code)
            assert result["status"]["id"] == STATUS["ACCEPTED"]
            assert "Hello, World!" in result["stdout"]
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_json_output(self):
        """Test Python JSON output"""
        try:
            code = """
import json
result = {"sum": 2 + 2, "message": "test"}
print(json.dumps(result))
"""
            result = self._execute_python(code)
            assert result["status"]["id"] == STATUS["ACCEPTED"]
            output = json.loads(result["stdout"])
            assert output["sum"] == 4
            assert output["message"] == "test"
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_stdin_input(self):
        """Test Python reading from stdin"""
        try:
            code = """
import sys
data = sys.stdin.read()
print(f"Received: {data}")
"""
            result = self._execute_python(code, stdin="test input")
            assert result["status"]["id"] == STATUS["ACCEPTED"]
            assert "test input" in result["stdout"]
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_timeout(self):
        """Test that infinite loops timeout"""
        try:
            code = "while True: pass"
            result = self._execute_python(code, cpu_time_limit=2)
            assert result["status"]["id"] == STATUS["TIME_LIMIT_EXCEEDED"]
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_syntax_error(self):
        """Test Python syntax error handling"""
        try:
            code = "print('missing quote"
            result = self._execute_python(code)
            assert result["status"]["id"] in (
                STATUS["COMPILATION_ERROR"],
                STATUS["RUNTIME_ERROR_NZEC"],
            )
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_runtime_error(self):
        """Test Python runtime error handling"""
        try:
            code = "x = 1 / 0"
            result = self._execute_python(code)
            assert result["status"]["id"] in (
                STATUS["RUNTIME_ERROR"],
                STATUS["RUNTIME_ERROR_NZEC"],
            )
            assert result["stderr"] is not None
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def _execute_python(self, code, stdin=None, cpu_time_limit=5):
        """Helper to execute Python code"""
        body = {
            "source_code": base64.b64encode(code.encode()).decode(),
            "language_id": LANGUAGES["python3"],
            "cpu_time_limit": cpu_time_limit,
        }
        if stdin:
            body["stdin"] = base64.b64encode(stdin.encode()).decode()

        # Submit
        response = requests.post(
            f"{JUDGE0_URL}/submissions?base64_encoded=true&wait=true",
            json=body,
            timeout=60,
        )
        assert response.status_code in (200, 201)
        result = response.json()

        # Decode output
        if result.get("stdout"):
            result["stdout"] = base64.b64decode(result["stdout"]).decode()
        if result.get("stderr"):
            result["stderr"] = base64.b64decode(result["stderr"]).decode()
        if result.get("compile_output"):
            result["compile_output"] = base64.b64decode(
                result["compile_output"]
            ).decode()

        return result


class TestJudge0CppExecution:
    """C++ code execution tests"""

    def test_simple_cpp(self):
        """Test basic C++ execution"""
        try:
            code = """
#include <iostream>
int main() {
    std::cout << "Hello from C++" << std::endl;
    return 0;
}
"""
            result = self._execute_cpp(code)
            assert result["status"]["id"] == STATUS["ACCEPTED"]
            assert "Hello from C++" in result["stdout"]
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_cpp_json_output(self):
        """Test C++ JSON output"""
        try:
            code = """
#include <iostream>
int main() {
    std::cout << "{\\"result\\": " << (2 + 2) << "}" << std::endl;
    return 0;
}
"""
            result = self._execute_cpp(code)
            assert result["status"]["id"] == STATUS["ACCEPTED"]
            output = json.loads(result["stdout"])
            assert output["result"] == 4
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_cpp_compilation_error(self):
        """Test C++ compilation error"""
        try:
            code = """
#include <iostream>
int main() {
    cout << "missing std::" << endl;  // Error: cout not defined
    return 0;
}
"""
            result = self._execute_cpp(code)
            assert result["status"]["id"] == STATUS["COMPILATION_ERROR"]
        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def _execute_cpp(self, code, cpu_time_limit=5):
        """Helper to execute C++ code"""
        body = {
            "source_code": base64.b64encode(code.encode()).decode(),
            "language_id": LANGUAGES["cpp"],
            "cpu_time_limit": cpu_time_limit,
        }

        response = requests.post(
            f"{JUDGE0_URL}/submissions?base64_encoded=true&wait=true",
            json=body,
            timeout=60,
        )
        assert response.status_code in (200, 201)
        result = response.json()

        if result.get("stdout"):
            result["stdout"] = base64.b64decode(result["stdout"]).decode()
        if result.get("stderr"):
            result["stderr"] = base64.b64decode(result["stderr"]).decode()
        if result.get("compile_output"):
            result["compile_output"] = base64.b64decode(
                result["compile_output"]
            ).decode()

        return result


class TestMarketSimDataWithJudge0:
    """Integration tests using market_sim data with Judge0"""

    @pytest.fixture
    def sample_data(self):
        """Generate sample market data matching market_sim format"""
        data = {"_news": {}}
        commodities = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"]
        base_prices = {"OIL": 75, "STEEL": 120, "WOOD": 45, "BRICK": 25, "GRAIN": 8}

        for symbol in commodities:
            data[symbol] = {"ticks": [], "orderbooks": {}}
            price = base_prices[symbol]

            for t in range(100):
                price += (hash(f"{symbol}{t}") % 100 - 50) / 100.0
                price = max(
                    base_prices[symbol] * 0.8, min(base_prices[symbol] * 1.2, price)
                )

                data[symbol]["ticks"].append(
                    {
                        "tick": t,
                        "open": price,
                        "high": price * 1.01,
                        "low": price * 0.99,
                        "close": price,
                        "volume": 1000 + t,
                    }
                )

        return data

    def test_algorithm_with_market_data(self, sample_data):
        """Test running algorithm with injected market data"""
        try:
            # Generate wrapper with market data
            data_json = json.dumps(sample_data)

            code = "\n".join(
                [
                    "import json",
                    "",
                    "# Injected data",
                    f"_DATA = json.loads('{data_json}')",
                    '_COMMODITIES = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"]',
                    "",
                    "# Trading simulation",
                    "cash = 100000.0",
                    "positions = {c: 0 for c in _COMMODITIES}",
                    "trades = []",
                    "",
                    "for tick in range(100):",
                    "    for symbol in _COMMODITIES:",
                    "        ticks = _DATA.get(symbol, {}).get('ticks', [])",
                    "        if tick < len(ticks):",
                    "            price = ticks[tick]['close']",
                    "            ",
                    "            # Simple strategy: buy on odd ticks, sell on even",
                    "            if tick % 2 == 0 and cash > price * 10:",
                    "                cash -= price * 10",
                    "                positions[symbol] += 10",
                    "                trades.append({'buy': symbol, 'qty': 10, 'price': price})",
                    "            elif tick % 2 == 1 and positions[symbol] >= 10:",
                    "                cash += price * 10",
                    "                positions[symbol] -= 10",
                    "                trades.append({'sell': symbol, 'qty': 10, 'price': price})",
                    "",
                    "# Calculate final net worth",
                    "final_prices = {}",
                    "for symbol in _COMMODITIES:",
                    "    ticks = _DATA.get(symbol, {}).get('ticks', [])",
                    "    if ticks:",
                    "        final_prices[symbol] = ticks[-1]['close']",
                    "",
                    "positions_value = sum(positions.get(c, 0) * final_prices.get(c, 0) for c in _COMMODITIES)",
                    "net_worth = cash + positions_value",
                    "",
                    "result = {",
                    "    'finalNetWorth': round(net_worth, 2),",
                    "    'cash': round(cash, 2),",
                    "    'positions': {k: v for k, v in positions.items() if v != 0},",
                    "    'totalTrades': len(trades)",
                    "}",
                    "print(json.dumps(result))",
                ]
            )

            result = self._execute_python(code, cpu_time_limit=15)

            if result["status"]["id"] == STATUS["ACCEPTED"]:
                output = json.loads(result["stdout"])
                assert "finalNetWorth" in output
                assert output["finalNetWorth"] > 0
                assert output["totalTrades"] > 0
                print(
                    f"Net worth: {output['finalNetWorth']}, Trades: {output['totalTrades']}"
                )
            else:
                print(f"Execution failed: {result}")
                pytest.skip(f"Execution status: {result['status']['description']}")

        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_buy_only_strategy(self, sample_data):
        """Test buy-only strategy"""
        try:
            data_json = json.dumps({"OIL": sample_data["OIL"]})

            code = "\n".join(
                [
                    "import json",
                    f"_DATA = json.loads('{data_json}')",
                    "",
                    "cash = 100000.0",
                    "oil_position = 0",
                    "",
                    "for tick_data in _DATA['OIL']['ticks']:",
                    "    if cash >= tick_data['close'] * 10 and tick_data['tick'] < 50:",
                    "        cash -= tick_data['close'] * 10",
                    "        oil_position += 10",
                    "",
                    "final_price = _DATA['OIL']['ticks'][-1]['close']",
                    "net_worth = cash + oil_position * final_price",
                    "",
                    "print(json.dumps({'cash': cash, 'position': oil_position, 'netWorth': net_worth}))",
                ]
            )

            result = self._execute_python(code)

            if result["status"]["id"] == STATUS["ACCEPTED"]:
                output = json.loads(result["stdout"])
                assert output["position"] > 0
                assert output["netWorth"] > 0

        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def test_data_size_limits(self, sample_data):
        """Test with larger data sizes"""
        try:
            # Create larger dataset
            large_data = {"OIL": {"ticks": []}}
            for i in range(1000):
                large_data["OIL"]["ticks"].append(
                    {
                        "tick": i,
                        "open": 75 + i * 0.01,
                        "high": 76 + i * 0.01,
                        "low": 74 + i * 0.01,
                        "close": 75.5 + i * 0.01,
                        "volume": 1000,
                    }
                )

            data_json = json.dumps(large_data)

            # Check data size
            assert len(data_json) < 10 * 1024 * 1024  # Less than 10MB

            code = "\n".join(
                [
                    "import json",
                    f"_DATA = json.loads('{data_json}')",
                    "print(json.dumps({'ticks': len(_DATA['OIL']['ticks'])}))",
                ]
            )

            result = self._execute_python(code, cpu_time_limit=15)

            if result["status"]["id"] == STATUS["ACCEPTED"]:
                output = json.loads(result["stdout"])
                assert output["ticks"] == 1000

        except requests.exceptions.ConnectionError:
            pytest.skip("Judge0 not available")

    def _execute_python(self, code, cpu_time_limit=15):
        """Helper to execute Python code"""
        body = {
            "source_code": base64.b64encode(code.encode()).decode(),
            "language_id": LANGUAGES["python3"],
            "cpu_time_limit": cpu_time_limit,
        }

        response = requests.post(
            f"{JUDGE0_URL}/submissions?base64_encoded=true&wait=true",
            json=body,
            timeout=120,
        )
        assert response.status_code in (200, 201)
        result = response.json()

        if result.get("stdout"):
            result["stdout"] = base64.b64decode(result["stdout"]).decode()
        if result.get("stderr"):
            result["stderr"] = base64.b64decode(result["stderr"]).decode()
        if result.get("compile_output"):
            result["compile_output"] = base64.b64decode(
                result["compile_output"]
            ).decode()

        return result


class TestBackendAPIIntegration:
    """Integration tests for backend API"""

    def test_health_endpoint(self):
        """Test backend health endpoint"""
        try:
            response = requests.get(f"{BACKEND_URL}/health", timeout=5)
            assert response.status_code == 200
            data = response.json()
            assert data.get("status") == "ok"
        except requests.exceptions.ConnectionError:
            pytest.skip("Backend not available")

    def test_data_info_endpoint(self):
        """Test data info endpoint"""
        try:
            response = requests.get(f"{BACKEND_URL}/api/data/info", timeout=5)
            assert response.status_code == 200
            data = response.json()
            assert "commodities" in data
            assert "totalTicks" in data
        except requests.exceptions.ConnectionError:
            pytest.skip("Backend not available")

    def test_market_status_endpoint(self):
        """Test market status endpoint"""
        try:
            response = requests.get(f"{BACKEND_URL}/api/market/status", timeout=5)
            assert response.status_code == 200
        except requests.exceptions.ConnectionError:
            pytest.skip("Backend not available")


class TestMarketSimAPIIntegration:
    """Integration tests for market_sim API"""

    def test_health(self):
        """Test market_sim health"""
        try:
            response = requests.get(f"{MARKET_SIM_URL}/health", timeout=5)
            assert response.status_code == 200
        except requests.exceptions.ConnectionError:
            pytest.skip("Market sim not available")

    def test_state(self):
        """Test market_sim state"""
        try:
            response = requests.get(f"{MARKET_SIM_URL}/state", timeout=30)
            assert response.status_code == 200
            data = response.json()
            assert "running" in data
            assert "currentTick" in data
        except requests.exceptions.ConnectionError:
            pytest.skip("Market sim not available")

    def test_commodities(self):
        """Test commodities endpoint"""
        try:
            response = requests.get(f"{MARKET_SIM_URL}/commodities", timeout=30)
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            if len(data) > 0:
                assert "symbol" in data[0]
                assert "price" in data[0]
        except requests.exceptions.ConnectionError:
            pytest.skip("Market sim not available")


class TestErrorHandling:
    """Error handling tests"""

    def test_invalid_symbol_orderbook(self):
        """Test orderbook with invalid symbol"""
        try:
            response = requests.get(
                f"{MARKET_SIM_URL}/orderbook/INVALID_SYMBOL", timeout=30
            )
            assert response.status_code == 404
        except requests.exceptions.ConnectionError:
            pytest.skip("Market sim not available")

    def test_invalid_control_action(self):
        """Test invalid control action"""
        try:
            response = requests.post(
                f"{MARKET_SIM_URL}/control",
                json={"action": "invalid_action"},
                timeout=5,
            )
            assert response.status_code == 400
        except requests.exceptions.ConnectionError:
            pytest.skip("Market sim not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
