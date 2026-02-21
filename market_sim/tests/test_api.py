import pytest
import requests
import json
import time
import subprocess
import os
import signal
import sys

# Base URL for market sim API
BASE_URL = os.environ.get("MARKET_SIM_URL", "http://localhost:8080")


@pytest.fixture(scope="module")
def market_sim_process():
    """Start market_sim process for testing"""
    # Check if already running
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        if response.status_code == 200:
            yield None
            return
    except:
        pass

    # Start process
    proc = subprocess.Popen(
        ["./market_sim", "--port", "8080"],
        cwd=os.environ.get("MARKET_SIM_DIR", "."),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for startup
    for _ in range(30):
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=1)
            if response.status_code == 200:
                break
        except:
            pass
        time.sleep(1)

    yield proc

    # Cleanup
    if proc:
        proc.terminate()
        proc.wait(timeout=5)


class TestHealthEndpoint:
    """Tests for /health endpoint"""

    def test_health_returns_200(self, market_sim_process):
        """Health endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200

    def test_health_returns_json(self, market_sim_process):
        """Health endpoint should return JSON"""
        response = requests.get(f"{BASE_URL}/health")
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"


class TestStateEndpoint:
    """Tests for /state endpoint"""

    def test_state_returns_json(self, market_sim_process):
        """State endpoint should return valid JSON"""
        response = requests.get(f"{BASE_URL}/state")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_state_has_required_fields(self, market_sim_process):
        """State should have all required fields"""
        response = requests.get(f"{BASE_URL}/state")
        data = response.json()

        required_fields = ["running", "paused", "populating", "currentTick"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"

    def test_state_running_is_boolean(self, market_sim_process):
        """running field should be boolean"""
        response = requests.get(f"{BASE_URL}/state")
        data = response.json()
        assert isinstance(data["running"], bool)

    def test_state_currentTick_is_number(self, market_sim_process):
        """currentTick should be a number"""
        response = requests.get(f"{BASE_URL}/state")
        data = response.json()
        assert isinstance(data["currentTick"], (int, float))


class TestCommoditiesEndpoint:
    """Tests for /commodities endpoint"""

    def test_commodities_returns_array(self, market_sim_process):
        """Commodities endpoint should return array"""
        response = requests.get(f"{BASE_URL}/commodities")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_commodities_have_required_fields(self, market_sim_process):
        """Each commodity should have required fields"""
        response = requests.get(f"{BASE_URL}/commodities")
        commodities = response.json()

        required_fields = ["symbol", "name", "price"]
        for commodity in commodities:
            for field in required_fields:
                assert field in commodity, f"Commodity missing field: {field}"

    def test_commodities_have_valid_prices(self, market_sim_process):
        """Commodity prices should be positive numbers"""
        response = requests.get(f"{BASE_URL}/commodities")
        commodities = response.json()

        for commodity in commodities:
            assert commodity["price"] > 0, f"Invalid price for {commodity['symbol']}"


class TestAgentsEndpoint:
    """Tests for /agents endpoint"""

    def test_agents_returns_array(self, market_sim_process):
        """Agents endpoint should return array"""
        response = requests.get(f"{BASE_URL}/agents")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_agents_have_type_and_count(self, market_sim_process):
        """Each agent entry should have type and count"""
        response = requests.get(f"{BASE_URL}/agents")
        agents = response.json()

        for agent in agents:
            assert "type" in agent
            assert "count" in agent
            assert agent["count"] >= 0


class TestControlEndpoint:
    """Tests for /control endpoint"""

    def test_control_pause(self, market_sim_process):
        """Pause action should work"""
        response = requests.post(
            f"{BASE_URL}/control",
            json={"action": "pause"},
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["paused"] == True or data.get("paused") == True

    def test_control_resume(self, market_sim_process):
        """Resume action should work"""
        # First pause
        requests.post(
            f"{BASE_URL}/control",
            json={"action": "pause"},
            headers={"Content-Type": "application/json"},
        )

        # Then resume
        response = requests.post(
            f"{BASE_URL}/control",
            json={"action": "resume"},
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200

    def test_control_invalid_action(self, market_sim_process):
        """Invalid action should return error"""
        response = requests.post(
            f"{BASE_URL}/control",
            json={"action": "invalid_action"},
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_control_step(self, market_sim_process):
        """Step action should advance ticks"""
        # Get current state
        state_before = requests.get(f"{BASE_URL}/state").json()
        tick_before = state_before["currentTick"]

        # Step 10 ticks
        response = requests.post(
            f"{BASE_URL}/control",
            json={"action": "step", "count": 10},
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200

        # Verify tick advanced
        state_after = requests.get(f"{BASE_URL}/state").json()
        tick_after = state_after["currentTick"]
        assert tick_after >= tick_before + 10


class TestExportEndpoint:
    """Tests for /export endpoint"""

    def test_export_status(self, market_sim_process):
        """Export status endpoint should work"""
        response = requests.get(f"{BASE_URL}/export/status")
        assert response.status_code == 200
        data = response.json()

        assert "isExporting" in data
        assert "progress" in data
        assert "totalTicks" in data

    def test_export_status_progress_is_number(self, market_sim_process):
        """Progress should be a number between 0 and 1"""
        response = requests.get(f"{BASE_URL}/export/status")
        data = response.json()

        assert isinstance(data["progress"], (int, float))
        assert 0 <= data["progress"] <= 1


class TestTicksCountEndpoint:
    """Tests for /ticks/count endpoint"""

    def test_ticks_count_returns_json(self, market_sim_process):
        """Ticks count should return JSON"""
        response = requests.get(f"{BASE_URL}/ticks/count")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert "currentTick" in data


class TestMetricsEndpoint:
    """Tests for /metrics endpoint"""

    def test_metrics_returns_json(self, market_sim_process):
        """Metrics should return JSON"""
        response = requests.get(f"{BASE_URL}/metrics")
        assert response.status_code == 200
        data = response.json()

        assert "totalTicks" in data
        assert "totalTrades" in data
        assert "totalOrders" in data


class TestCandlesEndpoint:
    """Tests for /candles endpoint"""

    def test_candles_symbol(self, market_sim_process):
        """Candles for a symbol should return array"""
        response = requests.get(f"{BASE_URL}/candles/OIL")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_candles_have_ohlcv(self, market_sim_process):
        """Each candle should have OHLCV fields"""
        response = requests.get(f"{BASE_URL}/candles/OIL?limit=10")
        candles = response.json()

        if len(candles) > 0:
            required = ["time", "open", "high", "low", "close", "volume"]
            for candle in candles[:5]:
                for field in required:
                    assert field in candle, f"Candle missing field: {field}"

    def test_candles_bulk(self, market_sim_process):
        """Bulk candles should return all symbols"""
        response = requests.get(f"{BASE_URL}/candles/bulk")
        assert response.status_code == 200
        data = response.json()

        # Should have at least OIL
        assert "OIL" in data or len(data) > 0


class TestOrderbookEndpoint:
    """Tests for /orderbook endpoint"""

    def test_orderbook_symbol(self, market_sim_process):
        """Orderbook for symbol should return valid structure"""
        response = requests.get(f"{BASE_URL}/orderbook/OIL")

        if response.status_code == 200:
            data = response.json()
            assert "symbol" in data
            assert "bids" in data
            assert "asks" in data

    def test_orderbook_invalid_symbol(self, market_sim_process):
        """Invalid symbol should return 404"""
        response = requests.get(f"{BASE_URL}/orderbook/INVALID")
        assert response.status_code == 404


class TestDiagnosticsEndpoint:
    """Tests for /diagnostics endpoint"""

    def test_diagnostics_returns_comprehensive_data(self, market_sim_process):
        """Diagnostics should return comprehensive data"""
        response = requests.get(f"{BASE_URL}/diagnostics")
        assert response.status_code == 200
        data = response.json()

        # Should have multiple sections
        assert "agents" in data or "commodities" in data or "metrics" in data


class TestNewsEndpoint:
    """Tests for /news endpoints"""

    def test_news_history(self, market_sim_process):
        """News history should return array"""
        response = requests.get(f"{BASE_URL}/news/history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_news_inject(self, market_sim_process):
        """News injection should work"""
        response = requests.post(
            f"{BASE_URL}/news",
            json={
                "category": "global",
                "sentiment": "positive",
                "magnitude": 0.05,
                "headline": "Test news event",
            },
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200


class TestConfigEndpoint:
    """Tests for /config endpoints"""

    def test_config_get(self, market_sim_process):
        """Config get should return JSON"""
        response = requests.get(f"{BASE_URL}/config")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_config_defaults(self, market_sim_process):
        """Config defaults should return valid config"""
        response = requests.get(f"{BASE_URL}/config/defaults")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
