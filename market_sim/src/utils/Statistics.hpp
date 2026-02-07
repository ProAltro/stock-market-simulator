#pragma once

#include <vector>
#include <cmath>
#include <numeric>
#include <algorithm>

namespace market {

class Statistics {
public:
    // Simple Moving Average
    static double sma(const std::vector<double>& data, size_t period) {
        if (data.size() < period) return 0.0;
        
        double sum = 0.0;
        for (size_t i = data.size() - period; i < data.size(); ++i) {
            sum += data[i];
        }
        return sum / period;
    }
    
    // Exponential Moving Average
    static double ema(const std::vector<double>& data, size_t period) {
        if (data.empty()) return 0.0;
        
        double alpha = 2.0 / (period + 1);
        double result = data[0];
        
        for (size_t i = 1; i < data.size(); ++i) {
            result = alpha * data[i] + (1 - alpha) * result;
        }
        return result;
    }
    
    // Standard deviation
    static double stddev(const std::vector<double>& data, size_t period) {
        if (data.size() < period) return 0.0;
        
        double mean = sma(data, period);
        double sqSum = 0.0;
        
        for (size_t i = data.size() - period; i < data.size(); ++i) {
            sqSum += (data[i] - mean) * (data[i] - mean);
        }
        
        return std::sqrt(sqSum / period);
    }
    
    // Calculate returns from price series
    static std::vector<double> returns(const std::vector<double>& prices) {
        std::vector<double> ret;
        if (prices.size() < 2) return ret;
        
        for (size_t i = 1; i < prices.size(); ++i) {
            if (prices[i - 1] > 0) {
                ret.push_back((prices[i] - prices[i - 1]) / prices[i - 1]);
            }
        }
        return ret;
    }
    
    // Volatility (annualized)
    static double volatility(const std::vector<double>& prices, size_t period = 20, int annualizationFactor = 252) {
        auto rets = returns(prices);
        if (rets.size() < period) return 0.0;
        
        double vol = stddev(rets, std::min(period, rets.size()));
        return vol * std::sqrt(annualizationFactor);
    }
    
    // Skewness
    static double skewness(const std::vector<double>& data) {
        if (data.size() < 3) return 0.0;
        
        double mean = std::accumulate(data.begin(), data.end(), 0.0) / data.size();
        double std = stddev(data, data.size());
        
        if (std <= 0) return 0.0;
        
        double sum = 0.0;
        for (double x : data) {
            double z = (x - mean) / std;
            sum += z * z * z;
        }
        
        return sum / data.size();
    }
    
    // Kurtosis
    static double kurtosis(const std::vector<double>& data) {
        if (data.size() < 4) return 0.0;
        
        double mean = std::accumulate(data.begin(), data.end(), 0.0) / data.size();
        double std = stddev(data, data.size());
        
        if (std <= 0) return 0.0;
        
        double sum = 0.0;
        for (double x : data) {
            double z = (x - mean) / std;
            sum += z * z * z * z;
        }
        
        return sum / data.size() - 3.0;  // Excess kurtosis
    }
    
    // Autocorrelation at lag
    static double autocorrelation(const std::vector<double>& data, int lag) {
        if (data.size() <= static_cast<size_t>(lag)) return 0.0;
        
        double mean = std::accumulate(data.begin(), data.end(), 0.0) / data.size();
        
        double numerator = 0.0;
        double denominator = 0.0;
        
        for (size_t i = lag; i < data.size(); ++i) {
            numerator += (data[i] - mean) * (data[i - lag] - mean);
        }
        
        for (size_t i = 0; i < data.size(); ++i) {
            denominator += (data[i] - mean) * (data[i] - mean);
        }
        
        return denominator > 0 ? numerator / denominator : 0.0;
    }
    
    // Z-score
    static double zscore(double value, const std::vector<double>& data, size_t period) {
        double mean = sma(data, period);
        double std = stddev(data, period);
        
        if (std <= 0) return 0.0;
        return (value - mean) / std;
    }
};

} // namespace market
