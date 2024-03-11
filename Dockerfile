FROM ubuntu:focal

# Set DEBIAN_FRONTEND early
ENV DEBIAN_FRONTEND=noninteractive

# Update package lists and install required packages
RUN apt-get update && \
    apt-get install -y \
        python3 \
        build-essential \
        gcc \
        g++ \
        clang \
        linux-headers-generic \
        curl \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs
RUN npm install npm@latest -g

# Set Python version
ENV PYTHON=python3

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the port your app runs on
EXPOSE 3000
EXPOSE 2000-2020
EXPOSE 10000-10100
ENV MEDIASOUP_WORKER_BIN="\node_modules\mediasoup\worker\out\Release\mediasoup-worker.exe"

# Command to run the application
CMD ["npm", "run", "dev"]
