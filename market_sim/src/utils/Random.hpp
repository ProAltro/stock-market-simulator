#pragma once

#include <random>
#include <cmath>

namespace market {

class Random {
public:
    // Get singleton random engine
    static std::mt19937& engine() {
        static std::mt19937 gen(std::random_device{}());
        return gen;
    }
    
    // Set seed for reproducibility
    static void seed(unsigned int s) {
        engine().seed(s);
    }
    
    // Uniform distribution [min, max]
    static double uniform(double min, double max) {
        std::uniform_real_distribution<double> dist(min, max);
        return dist(engine());
    }
    
    // Uniform integer [min, max]
    static int uniformInt(int min, int max) {
        std::uniform_int_distribution<int> dist(min, max);
        return dist(engine());
    }
    
    // Normal distribution
    static double normal(double mean, double stddev) {
        std::normal_distribution<double> dist(mean, stddev);
        return dist(engine());
    }
    
    // Log-normal distribution
    static double logNormal(double mean, double stddev) {
        std::lognormal_distribution<double> dist(mean, stddev);
        return dist(engine());
    }
    
    // Exponential distribution
    static double exponential(double lambda) {
        std::exponential_distribution<double> dist(lambda);
        return dist(engine());
    }
    
    // Poisson distribution
    static int poisson(double lambda) {
        std::poisson_distribution<int> dist(lambda);
        return dist(engine());
    }
    
    // Bernoulli (coin flip with probability p)
    static bool bernoulli(double p) {
        std::bernoulli_distribution dist(p);
        return dist(engine());
    }
};

} // namespace market
