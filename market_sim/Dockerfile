# Build stage
FROM alpine:3.19 AS builder

# Install build dependencies
RUN apk add --no-cache \
    cmake \
    g++ \
    make \
    git \
    linux-headers

WORKDIR /build

# Copy source code
COPY CMakeLists.txt .
COPY config.json .
COPY stocks.json .
COPY src/ src/

# Build
RUN mkdir build && cd build && \
    cmake -DCMAKE_BUILD_TYPE=Release .. && \
    cmake --build . --config Release -j$(nproc)

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache libstdc++ libgcc wget

WORKDIR /app

# Copy binary, config, and stock data
COPY --from=builder /build/build/market_sim .
COPY --from=builder /build/config.json .
COPY --from=builder /build/stocks.json .

EXPOSE 8080

CMD ["./market_sim", "--auto-start", "--stocks", "stocks.json"]
