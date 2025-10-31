# Decentralized VPN with Private Bandwidth Sharing (dVPN)

The Decentralized VPN (dVPN) powered by **Zama's Fully Homomorphic Encryption technology** provides users with unparalleled privacy and a unique opportunity to monetize their unused bandwidth. This innovative solution ensures that internet traffic remains confidential while allowing users to contribute to the network and earn rewards—all without exposing their personal connection details.

## Addressing Privacy Issues in Online Activity

In a world where digital privacy is increasingly at risk, users are often required to sacrifice their personal information to access secure and uncensored internet services. Traditional VPNs can inadvertently compromise user privacy through logging practices and inadequate security measures. Moreover, the lack of monetization options for idle bandwidth leads to significant underutilization of available resources.

## The FHE-Powered Solution

Our dVPN utilizes **Fully Homomorphic Encryption (FHE)**, implemented with Zama's robust open-source libraries like **Concrete** and **TFHE-rs**, to address these privacy concerns dynamically. With FHE, user traffic metadata is encrypted at all stages, ensuring that even while shared across the network, sensitive information remains unreadable. Users can safely "lend" their unused bandwidth to the network, contributing to a decentralized marketplace while generating income without risking exposure of their internet activity or personal details.

## Core Features

- **Encrypted Traffic Metadata:** All user traffic is anonymized and FHE encrypted, safeguarding personal data from prying eyes.
- **Idle Bandwidth Contribution:** Users can contribute their idle bandwidth to the network, earning rewards while maintaining complete control over their connections.
- **Homomorphic Settlement for Bandwidth Market:** The financial transactions within the bandwidth marketplace are settled in a fully homomorphic manner, retaining privacy and security.
- **Ultimate Anonymity:** With cutting-edge encryption techniques, users can access the internet anonymously, free from surveillance or logging.
- **User Dashboard:** A comprehensive dashboard allows users to track their bandwidth contributions, earnings, and overall network performance.

## Technology Stack

This project leverages an array of powerful technologies to maintain its features and performance:

- **Zama FHE SDK** (Concrete, TFHE-rs)
- **Solidity** (for smart contract development)
- **Node.js** (for backend services)
- **Hardhat** (for development environment)
- **Express.js** (for server framework)

## Project Structure

Here's what the project's directory looks like:

```
/dVPN
│
├── contracts
│   └── dvpnFHE_Share.sol
│
├── src
│   ├── backend
│   ├── frontend
│   └── utils
│
├── tests
│   └── dvpnFHE_Share.test.js
│
├── package.json
└── README.md
```

## Installation Guide

To set up this project, ensure you have the following dependencies installed:

1. **Node.js** – This provides the JavaScript runtime environment.
2. **Hardhat** or **Foundry** – Choose one for your development environment.

Once these dependencies are in place, follow the steps below:

1. Navigate to the root of the project directory.
2. Run the following command:

```bash
npm install
```

This command will install all necessary dependencies, including the Zama FHE libraries required to operate the dVPN.

**Important:** Please refrain from using `git clone` to download this project or any URLs. Follow the specific installation method outlined above.

## Build & Run Instructions

To compile, test, and execute the dVPN, use the following commands:

1. **Compile Contracts:**

```bash
npx hardhat compile
```

2. **Run Tests:**

```bash
npx hardhat test
```

3. **Start the Backend Server:**

```bash
node src/backend/index.js
```

Once the server is running, you can access the dVPN services through the designated endpoint provided in your server configuration, and interact with the network using the user dashboard.

## Example Code Snippet

Here's a simple code example demonstrating how user contributions to the bandwidth sharing system are handled using encrypted metadata:

```javascript
const { encryptMetadata, shareBandwidth } = require('./utils/encryption');

function contributeBandwidth(userId, bandwidthAmount) {
    const metadata = {
        user: userId,
        bandwidth: bandwidthAmount
    };

    const encryptedData = encryptMetadata(metadata);
    const result = shareBandwidth(encryptedData);
    return result
        ? "Bandwidth shared successfully."
        : "Failed to share bandwidth.";
}
```

This function encrypts the user's bandwidth contribution details and then processes the shared data securely within the network.

## Acknowledgements

### Powered by Zama

We extend our heartfelt gratitude to the Zama team for their groundbreaking work and commitment to open-source solutions that enable confidential blockchain applications. Their innovative FHE technology makes our project possible and ensures a future where privacy and security thrive in the digital landscape.

---
This README serves as a comprehensive guide to understanding and utilizing the Decentralized VPN with Private Bandwidth Sharing. We invite developers to contribute and enhance the project further, leveraging the power of Zama's technology for a secure internet experience.
```
