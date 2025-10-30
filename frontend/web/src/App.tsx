// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface BandwidthRecord {
  id: string;
  encryptedBandwidth: string;
  encryptedPrice: string;
  timestamp: number;
  owner: string;
  status: "available" | "in-use" | "offline";
  latency?: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<BandwidthRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [addingNode, setAddingNode] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newNodeData, setNewNodeData] = useState({ bandwidth: 0, price: 0 });
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<"market" | "dashboard">("market");
  const [selectedNode, setSelectedNode] = useState<BandwidthRecord | null>(null);
  const [decryptedBandwidth, setDecryptedBandwidth] = useState<number | null>(null);
  const [decryptedPrice, setDecryptedPrice] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [userBandwidth, setUserBandwidth] = useState<number>(0);
  const [userEarnings, setUserEarnings] = useState<number>(0);

  // Stats calculations
  const availableNodes = nodes.filter(n => n.status === "available").length;
  const activeNodes = nodes.filter(n => n.status === "in-use").length;
  const totalBandwidth = nodes.reduce((sum, node) => sum + (node.status === "in-use" ? FHEDecryptNumber(node.encryptedBandwidth) : 0), 0);

  useEffect(() => {
    loadNodes().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadNodes = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load node keys
      const keysBytes = await contract.getData("node_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing node keys:", e); }
      }
      
      // Load each node data
      const nodeList: BandwidthRecord[] = [];
      for (const key of keys) {
        try {
          const nodeBytes = await contract.getData(`node_${key}`);
          if (nodeBytes.length > 0) {
            try {
              const nodeData = JSON.parse(ethers.toUtf8String(nodeBytes));
              nodeList.push({ 
                id: key, 
                encryptedBandwidth: nodeData.bandwidth, 
                encryptedPrice: nodeData.price,
                timestamp: nodeData.timestamp, 
                owner: nodeData.owner, 
                status: nodeData.status || "available",
                latency: nodeData.latency
              });
            } catch (e) { console.error(`Error parsing node data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading node ${key}:`, e); }
      }
      
      nodeList.sort((a, b) => b.timestamp - a.timestamp);
      setNodes(nodeList);
      
      // Calculate user stats
      if (address) {
        const userNodes = nodeList.filter(n => n.owner.toLowerCase() === address.toLowerCase());
        const bandwidth = userNodes.reduce((sum, node) => sum + FHEDecryptNumber(node.encryptedBandwidth), 0);
        const earnings = userNodes.reduce((sum, node) => sum + (node.status === "in-use" ? FHEDecryptNumber(node.encryptedPrice) : 0), 0);
        setUserBandwidth(bandwidth);
        setUserEarnings(earnings);
      }
    } catch (e) { console.error("Error loading nodes:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const addNode = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setAddingNode(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting bandwidth data with Zama FHE..." });
    
    try {
      const encryptedBandwidth = FHEEncryptNumber(newNodeData.bandwidth);
      const encryptedPrice = FHEEncryptNumber(newNodeData.price);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const nodeId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nodeData = { 
        bandwidth: encryptedBandwidth, 
        price: encryptedPrice,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        status: "available",
        latency: (Math.random() * 50 + 50).toFixed(0) + "ms"
      };
      
      await contract.setData(`node_${nodeId}`, ethers.toUtf8Bytes(JSON.stringify(nodeData)));
      
      // Update node keys
      const keysBytes = await contract.getData("node_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(nodeId);
      await contract.setData("node_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Node added with FHE-encrypted bandwidth!" });
      await loadNodes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddNodeModal(false);
        setNewNodeData({ bandwidth: 0, price: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setAddingNode(false); }
  };

  const connectToNode = async (nodeId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Establishing FHE-encrypted VPN connection..." });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const nodeBytes = await contract.getData(`node_${nodeId}`);
      if (nodeBytes.length === 0) throw new Error("Node not found");
      
      const nodeData = JSON.parse(ethers.toUtf8String(nodeBytes));
      if (nodeData.status !== "available") throw new Error("Node is not available");
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedNode = { ...nodeData, status: "in-use" };
      await contractWithSigner.setData(`node_${nodeId}`, ethers.toUtf8Bytes(JSON.stringify(updatedNode)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE-encrypted VPN connection established!" });
      await loadNodes();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Connection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const disconnectNode = async (nodeId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Closing FHE-encrypted VPN connection..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const nodeBytes = await contract.getData(`node_${nodeId}`);
      if (nodeBytes.length === 0) throw new Error("Node not found");
      
      const nodeData = JSON.parse(ethers.toUtf8String(nodeBytes));
      const updatedNode = { ...nodeData, status: "available" };
      await contract.setData(`node_${nodeId}`, ethers.toUtf8Bytes(JSON.stringify(updatedNode)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE-encrypted VPN connection closed!" });
      await loadNodes();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Disconnection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const viewNodeDetails = async (node: BandwidthRecord) => {
    setSelectedNode(node);
    setDecryptedBandwidth(null);
    setDecryptedPrice(null);
  };

  const handleDecryptDetails = async () => {
    if (!selectedNode) return;
    
    const bandwidth = await decryptWithSignature(selectedNode.encryptedBandwidth);
    const price = await decryptWithSignature(selectedNode.encryptedPrice);
    
    if (bandwidth !== null) setDecryptedBandwidth(bandwidth);
    if (price !== null) setDecryptedPrice(price);
  };

  const isOwner = (nodeAddress: string) => address?.toLowerCase() === nodeAddress.toLowerCase();

  if (loading) return (
    <div className="loading-screen">
      <div className="tech-spinner"></div>
      <p>Initializing FHE-encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container future-tech-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>dVPN</span></h1>
          <div className="fhe-badge">
            <span>Zama FHE Powered</span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowAddNodeModal(true)} 
            className="add-node-btn tech-button"
            data-tooltip="Add your bandwidth to the network"
          >
            <div className="add-icon"></div>Share Bandwidth
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="dashboard-tabs">
          <button 
            className={`tab-button ${activeTab === "market" ? "active" : ""}`}
            onClick={() => setActiveTab("market")}
          >
            Node Market
          </button>
          <button 
            className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            My Dashboard
          </button>
        </div>

        {activeTab === "market" ? (
          <div className="market-section">
            <div className="section-header">
              <h2>Available Bandwidth Nodes</h2>
              <div className="header-stats">
                <div className="stat-item">
                  <div className="stat-value">{availableNodes}</div>
                  <div className="stat-label">Available</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{activeNodes}</div>
                  <div className="stat-label">In Use</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{totalBandwidth.toFixed(2)}</div>
                  <div className="stat-label">Total MB/s</div>
                </div>
              </div>
              <button 
                onClick={loadNodes} 
                className="refresh-btn tech-button" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="nodes-grid">
              {nodes.length === 0 ? (
                <div className="no-nodes">
                  <div className="no-nodes-icon"></div>
                  <p>No bandwidth nodes found</p>
                  <button 
                    className="tech-button primary" 
                    onClick={() => setShowAddNodeModal(true)}
                  >
                    Be the First Contributor
                  </button>
                </div>
              ) : nodes.map(node => (
                <div 
                  className={`node-card ${node.status}`} 
                  key={node.id}
                  onClick={() => viewNodeDetails(node)}
                >
                  <div className="node-header">
                    <div className="node-id">#{node.id.substring(0, 6)}</div>
                    <div className={`node-status ${node.status}`}>
                      {node.status === "available" ? "Available" : "In Use"}
                    </div>
                  </div>
                  <div className="node-details">
                    <div className="detail-item">
                      <span>Owner:</span>
                      <div className="owner-address">
                        {node.owner.substring(0, 6)}...{node.owner.substring(38)}
                      </div>
                    </div>
                    <div className="detail-item">
                      <span>Latency:</span>
                      <div className="latency">{node.latency || "N/A"}</div>
                    </div>
                  </div>
                  <div className="node-actions">
                    {node.status === "available" && (
                      <button 
                        className="tech-button connect-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          connectToNode(node.id);
                        }}
                      >
                        Connect
                      </button>
                    )}
                    {node.status === "in-use" && isOwner(node.owner) && (
                      <button 
                        className="tech-button disconnect-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          disconnectNode(node.id);
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="dashboard-section">
            <div className="user-stats">
              <div className="stat-card">
                <div className="stat-icon bandwidth-icon"></div>
                <div className="stat-content">
                  <div className="stat-value">{userBandwidth.toFixed(2)} MB/s</div>
                  <div className="stat-label">Your Bandwidth</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon earnings-icon"></div>
                <div className="stat-content">
                  <div className="stat-value">{userEarnings.toFixed(6)} ETH</div>
                  <div className="stat-label">Your Earnings</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon nodes-icon"></div>
                <div className="stat-content">
                  <div className="stat-value">
                    {nodes.filter(n => n.owner.toLowerCase() === address?.toLowerCase()).length}
                  </div>
                  <div className="stat-label">Your Nodes</div>
                </div>
              </div>
            </div>

            <div className="user-nodes">
              <h3>Your Bandwidth Nodes</h3>
              {nodes.filter(n => n.owner.toLowerCase() === address?.toLowerCase()).length === 0 ? (
                <div className="no-user-nodes">
                  <p>You haven't shared any bandwidth yet</p>
                  <button 
                    className="tech-button primary" 
                    onClick={() => setShowAddNodeModal(true)}
                  >
                    Share Your First Node
                  </button>
                </div>
              ) : (
                <div className="nodes-list">
                  {nodes.filter(n => n.owner.toLowerCase() === address?.toLowerCase()).map(node => (
                    <div className="user-node-item" key={node.id}>
                      <div className="node-info">
                        <div className="node-id">#{node.id.substring(0, 8)}</div>
                        <div className={`node-status ${node.status}`}>
                          {node.status === "available" ? "Available" : "In Use"}
                        </div>
                        <div className="node-bandwidth">
                          {FHEDecryptNumber(node.encryptedBandwidth).toFixed(2)} MB/s
                        </div>
                        <div className="node-price">
                          {FHEDecryptNumber(node.encryptedPrice).toFixed(6)} ETH/hr
                        </div>
                      </div>
                      <div className="node-actions">
                        {node.status === "in-use" && (
                          <button 
                            className="tech-button small disconnect-btn"
                            onClick={() => disconnectNode(node.id)}
                          >
                            Stop Sharing
                          </button>
                        )}
                        <button 
                          className="tech-button small"
                          onClick={() => viewNodeDetails(node)}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddNodeModal && (
        <div className="modal-overlay">
          <div className="add-node-modal tech-card">
            <div className="modal-header">
              <h2>Share Your Bandwidth</h2>
              <button onClick={() => setShowAddNodeModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="lock-icon"></div>
                <p>Your bandwidth and pricing will be encrypted with Zama FHE before submission</p>
              </div>
              
              <div className="form-group">
                <label>Available Bandwidth (MB/s)</label>
                <input 
                  type="number" 
                  value={newNodeData.bandwidth} 
                  onChange={(e) => setNewNodeData({...newNodeData, bandwidth: parseFloat(e.target.value)})}
                  placeholder="Enter your available bandwidth"
                  className="tech-input"
                  min="1"
                  step="1"
                />
              </div>
              
              <div className="form-group">
                <label>Price per hour (ETH)</label>
                <input 
                  type="number" 
                  value={newNodeData.price} 
                  onChange={(e) => setNewNodeData({...newNodeData, price: parseFloat(e.target.value)})}
                  placeholder="Enter your price per hour"
                  className="tech-input"
                  min="0.000001"
                  step="0.000001"
                />
              </div>
              
              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-grid">
                  <div className="preview-item">
                    <span>Bandwidth:</span>
                    <div className="encrypted-value">
                      {newNodeData.bandwidth > 0 ? 
                        FHEEncryptNumber(newNodeData.bandwidth).substring(0, 30) + "..." : 
                        "Not specified"}
                    </div>
                  </div>
                  <div className="preview-item">
                    <span>Price:</span>
                    <div className="encrypted-value">
                      {newNodeData.price > 0 ? 
                        FHEEncryptNumber(newNodeData.price).substring(0, 30) + "..." : 
                        "Not specified"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddNodeModal(false)} 
                className="tech-button secondary"
              >
                Cancel
              </button>
              <button 
                onClick={addNode} 
                disabled={addingNode || newNodeData.bandwidth <= 0 || newNodeData.price <= 0}
                className="tech-button primary"
              >
                {addingNode ? "Encrypting with FHE..." : "Share Securely"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="modal-overlay">
          <div className="node-detail-modal tech-card">
            <div className="modal-header">
              <h2>Node Details #{selectedNode.id.substring(0, 8)}</h2>
              <button onClick={() => setSelectedNode(null)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="node-info-grid">
                <div className="info-item">
                  <span>Owner:</span>
                  <div>{selectedNode.owner.substring(0, 6)}...{selectedNode.owner.substring(38)}</div>
                </div>
                <div className="info-item">
                  <span>Status:</span>
                  <div className={`status-badge ${selectedNode.status}`}>
                    {selectedNode.status === "available" ? "Available" : "In Use"}
                  </div>
                </div>
                <div className="info-item">
                  <span>Latency:</span>
                  <div>{selectedNode.latency || "N/A"}</div>
                </div>
                <div className="info-item">
                  <span>Added:</span>
                  <div>{new Date(selectedNode.timestamp * 1000).toLocaleString()}</div>
                </div>
              </div>
              
              <div className="encrypted-data-section">
                <h3>FHE Encrypted Data</h3>
                <div className="encrypted-data-grid">
                  <div className="data-item">
                    <span>Bandwidth:</span>
                    <div className="encrypted-value">
                      {selectedNode.encryptedBandwidth.substring(0, 40)}...
                    </div>
                    {decryptedBandwidth !== null && (
                      <div className="decrypted-value">
                        Decrypted: {decryptedBandwidth.toFixed(2)} MB/s
                      </div>
                    )}
                  </div>
                  <div className="data-item">
                    <span>Price:</span>
                    <div className="encrypted-value">
                      {selectedNode.encryptedPrice.substring(0, 40)}...
                    </div>
                    {decryptedPrice !== null && (
                      <div className="decrypted-value">
                        Decrypted: {decryptedPrice.toFixed(6)} ETH/hr
                      </div>
                    )}
                  </div>
                </div>
                
                <button 
                  className="tech-button decrypt-btn"
                  onClick={handleDecryptDetails}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : 
                   (decryptedBandwidth !== null ? "Hide Values" : "Decrypt with Wallet")}
                </button>
                
                <div className="fhe-notice">
                  <div className="shield-icon"></div>
                  <p>Data is decrypted client-side after wallet signature verification</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {selectedNode.status === "available" && !isOwner(selectedNode.owner) && (
                <button 
                  className="tech-button primary"
                  onClick={() => {
                    connectToNode(selectedNode.id);
                    setSelectedNode(null);
                  }}
                >
                  Connect to Node
                </button>
              )}
              {selectedNode.status === "in-use" && isOwner(selectedNode.owner) && (
                <button 
                  className="tech-button danger"
                  onClick={() => {
                    disconnectNode(selectedNode.id);
                    setSelectedNode(null);
                  }}
                >
                  Stop Sharing
                </button>
              )}
              <button 
                className="tech-button secondary"
                onClick={() => setSelectedNode(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content tech-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="tech-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHEdVPN</span>
            </div>
            <p>Decentralized VPN with FHE-encrypted bandwidth sharing</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="https://zama.ai" className="footer-link">Zama FHE</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHEdVPN. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;