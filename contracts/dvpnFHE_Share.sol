pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DVPNShareFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosedOrDoesNotExist();
    error InvalidParameter();
    error ReplayAttempt();
    error StateMismatch();
    error DecryptionFailed();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsChanged(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId, uint256 totalEncryptedBandwidth);
    event BandwidthContributed(address indexed provider, uint256 indexed batchId, bytes32 encryptedBandwidth);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalBandwidth);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct Batch {
        bool exists;
        bool closed;
        euint32 totalEncryptedBandwidth;
    }

    mapping(address => bool) public isProvider;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        cooldownSeconds = 60; // Default cooldown: 60 seconds
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidParameter();
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsChanged(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batches[batchId].exists) revert InvalidParameter(); // Batch ID must be unique
        batches[batchId] = Batch({ exists: true, closed: false, totalEncryptedBandwidth: FHE.asEuint32(0) });
        emit BatchOpened(batchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (!_batchExists(batchId)) revert BatchClosedOrDoesNotExist();
        if (batches[batchId].closed) revert BatchClosedOrDoesNotExist();
        batches[batchId].closed = true;
        emit BatchClosed(batchId, FHE.toBytes32(batches[batchId].totalEncryptedBandwidth));
    }

    function contributeBandwidth(uint256 batchId, euint32 encryptedBandwidth) external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) revert CooldownActive();
        if (!_batchExists(batchId) || batches[batchId].closed) revert BatchClosedOrDoesNotExist();

        lastSubmissionTime[msg.sender] = block.timestamp;
        batches[batchId].totalEncryptedBandwidth = FHE.add(batches[batchId].totalEncryptedBandwidth, encryptedBandwidth);
        emit BandwidthContributed(msg.sender, batchId, FHE.toBytes32(encryptedBandwidth));
    }

    function requestBatchDecryption(uint256 batchId) external onlyOwner whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) revert CooldownActive();
        if (!_batchExists(batchId) || !batches[batchId].closed) revert BatchClosedOrDoesNotExist();

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32[] memory cts = new euint32[](1);
        cts[0] = batches[batchId].totalEncryptedBandwidth;
        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // @dev Replay protection: ensure this callback hasn't been processed for this requestId
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // @dev State verification: ensure the contract state related to the ciphertexts hasn't changed
        // since the decryption was requested. This is crucial for ensuring the decrypted values
        // correspond to the state at the time of request.
        euint32[] memory currentCts = new euint32[](1);
        currentCts[0] = batches[decryptionContexts[requestId].batchId].totalEncryptedBandwidth;
        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        if (currentStateHash != decryptionContexts[requestId].stateHash) revert StateMismatch();

        // @dev Verify the proof of correct decryption from the FHEVM network
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert DecryptionFailed();

        // Decode cleartexts
        uint256 totalBandwidth = abi.decode(cleartexts, (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, totalBandwidth);
    }

    function _hashCiphertexts(euint32[] memory cts) internal pure returns (bytes32) {
        bytes32[] memory ctsBytes = new bytes32[](cts.length);
        for (uint i = 0; i < cts.length; i++) {
            ctsBytes[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctsBytes, address(this)));
    }

    function _batchExists(uint256 batchId) internal view returns (bool) {
        return batches[batchId].exists;
    }
}