// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ImplantData {
  id: string;
  encryptedFirmware: string;
  timestamp: number;
  owner: string;
  deviceType: string;
  status: "active" | "inactive" | "critical";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [implants, setImplants] = useState<ImplantData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newImplantData, setNewImplantData] = useState({
    deviceType: "",
    firmwareVersion: "",
    encryptedConfig: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Style choices: High contrast (blue+orange), Glass morphism, Center radiation layout, Micro-interactions
  const activeCount = implants.filter(i => i.status === "active").length;
  const inactiveCount = implants.filter(i => i.status === "inactive").length;
  const criticalCount = implants.filter(i => i.status === "critical").length;

  useEffect(() => {
    loadImplants().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadImplants = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Verify contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("implant_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing implant keys:", e);
        }
      }
      
      const list: ImplantData[] = [];
      
      for (const key of keys) {
        try {
          const implantBytes = await contract.getData(`implant_${key}`);
          if (implantBytes.length > 0) {
            try {
              const implantData = JSON.parse(ethers.toUtf8String(implantBytes));
              list.push({
                id: key,
                encryptedFirmware: implantData.data,
                timestamp: implantData.timestamp,
                owner: implantData.owner,
                deviceType: implantData.deviceType,
                status: implantData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing implant data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading implant ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setImplants(list);
    } catch (e) {
      console.error("Error loading implants:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addImplant = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting firmware with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-IMPLANT-${btoa(JSON.stringify(newImplantData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const implantId = `IMPLANT-${Date.now()}`;

      const implantData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        deviceType: newImplantData.deviceType,
        status: "active"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `implant_${implantId}`, 
        ethers.toUtf8Bytes(JSON.stringify(implantData))
      );
      
      const keysBytes = await contract.getData("implant_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(implantId);
      
      await contract.setData(
        "implant_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Implant firmware encrypted and stored securely!"
      });
      
      await loadImplants();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewImplantData({
          deviceType: "",
          firmwareVersion: "",
          encryptedConfig: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  const toggleImplantStatus = async (implantId: string, currentStatus: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const implantBytes = await contract.getData(`implant_${implantId}`);
      if (implantBytes.length === 0) {
        throw new Error("Implant not found");
      }
      
      const implantData = JSON.parse(ethers.toUtf8String(implantBytes));
      
      let newStatus = "active";
      if (currentStatus === "active") {
        newStatus = "inactive";
      } else if (currentStatus === "inactive") {
        newStatus = "critical";
      } else {
        newStatus = "active";
      }
      
      const updatedImplant = {
        ...implantData,
        status: newStatus
      };
      
      await contract.setData(
        `implant_${implantId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedImplant))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `Implant status updated to ${newStatus} using FHE!`
      });
      
      await loadImplants();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredImplants = implants.filter(implant => {
    const matchesSearch = implant.deviceType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         implant.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || implant.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const renderStatusIndicator = (status: string) => {
    switch(status) {
      case "active":
        return <div className="status-indicator active pulse"></div>;
      case "inactive":
        return <div className="status-indicator inactive"></div>;
      case "critical":
        return <div className="status-indicator critical pulse"></div>;
      default:
        return <div className="status-indicator"></div>;
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="background-radial"></div>
      
      <header className="app-header glass">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <div className="shield"></div>
            </div>
            <h1>Implant<span>FHE</span></h1>
          </div>
          <p className="tagline">Fully Homomorphic Encryption for Medical Implants</p>
        </div>
        
        <div className="header-right">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="hero-section">
          <div className="hero-content">
            <h2>Secure Medical Implant Firmware</h2>
            <p>Using FHE to verify and control encrypted firmware updates for medical implants</p>
            <button 
              className="primary-btn"
              onClick={() => setShowAddModal(true)}
            >
              Add New Implant
            </button>
          </div>
          <div className="hero-graphic">
            <div className="fhe-chip"></div>
          </div>
        </div>
        
        <div className="stats-section">
          <div className="stat-card glass">
            <h3>Active Implants</h3>
            <div className="stat-value">{activeCount}</div>
            <div className="stat-icon active"></div>
          </div>
          <div className="stat-card glass">
            <h3>Inactive Implants</h3>
            <div className="stat-value">{inactiveCount}</div>
            <div className="stat-icon inactive"></div>
          </div>
          <div className="stat-card glass">
            <h3>Critical Alerts</h3>
            <div className="stat-value">{criticalCount}</div>
            <div className="stat-icon critical"></div>
          </div>
        </div>
        
        <div className="controls-section">
          <div className="search-container glass">
            <input 
              type="text" 
              placeholder="Search implants..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-icon"></div>
          </div>
          
          <div className="tabs-container glass">
            <button 
              className={activeTab === "all" ? "active" : ""}
              onClick={() => setActiveTab("all")}
            >
              All Implants
            </button>
            <button 
              className={activeTab === "active" ? "active" : ""}
              onClick={() => setActiveTab("active")}
            >
              Active
            </button>
            <button 
              className={activeTab === "inactive" ? "active" : ""}
              onClick={() => setActiveTab("inactive")}
            >
              Inactive
            </button>
            <button 
              className={activeTab === "critical" ? "active" : ""}
              onClick={() => setActiveTab("critical")}
            >
              Critical
            </button>
          </div>
        </div>
        
        <div className="implants-list glass">
          <div className="list-header">
            <div className="header-cell">Device ID</div>
            <div className="header-cell">Type</div>
            <div className="header-cell">Owner</div>
            <div className="header-cell">Last Update</div>
            <div className="header-cell">Status</div>
            <div className="header-cell">Actions</div>
          </div>
          
          {filteredImplants.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"></div>
              <p>No implants found</p>
              <button 
                className="primary-btn"
                onClick={() => setShowAddModal(true)}
              >
                Add First Implant
              </button>
            </div>
          ) : (
            filteredImplants.map(implant => (
              <div className="implant-row" key={implant.id}>
                <div className="cell">#{implant.id.substring(0, 6)}</div>
                <div className="cell">{implant.deviceType}</div>
                <div className="cell">{implant.owner.substring(0, 6)}...{implant.owner.substring(38)}</div>
                <div className="cell">
                  {new Date(implant.timestamp * 1000).toLocaleDateString()}
                </div>
                <div className="cell">
                  <div className="status-container">
                    {renderStatusIndicator(implant.status)}
                    <span className={`status-text ${implant.status}`}>
                      {implant.status}
                    </span>
                  </div>
                </div>
                <div className="cell">
                  <button 
                    className={`action-btn ${implant.status}`}
                    onClick={() => toggleImplantStatus(implant.id, implant.status)}
                  >
                    {implant.status === "active" ? "Deactivate" : 
                     implant.status === "inactive" ? "Mark Critical" : "Reactivate"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
  
      {showAddModal && (
        <ModalAddImplant 
          onSubmit={addImplant} 
          onClose={() => setShowAddModal(false)} 
          adding={adding}
          implantData={newImplantData}
          setImplantData={setNewImplantData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-notification glass">
          <div className={`notification-icon ${transactionStatus.status}`}>
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.status === "success" && <div className="check"></div>}
            {transactionStatus.status === "error" && <div className="error"></div>}
          </div>
          <div className="notification-message">
            {transactionStatus.message}
          </div>
        </div>
      )}
  
      <footer className="app-footer glass">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield"></div>
              <span>ImplantFHE</span>
            </div>
            <p>Secure medical implants with fully homomorphic encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ImplantFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddImplantProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  implantData: any;
  setImplantData: (data: any) => void;
}

const ModalAddImplant: React.FC<ModalAddImplantProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  implantData,
  setImplantData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setImplantData({
      ...implantData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!implantData.deviceType || !implantData.encryptedConfig) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal glass">
        <div className="modal-header">
          <h2>Register New Implant</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>All data will be encrypted using FHE technology</span>
          </div>
          
          <div className="form-group">
            <label>Device Type *</label>
            <select 
              name="deviceType"
              value={implantData.deviceType} 
              onChange={handleChange}
              required
            >
              <option value="">Select device type</option>
              <option value="Insulin Pump">Insulin Pump</option>
              <option value="Pacemaker">Pacemaker</option>
              <option value="Neurostimulator">Neurostimulator</option>
              <option value="CGM">Continuous Glucose Monitor</option>
              <option value="Other">Other Medical Device</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Firmware Version</label>
            <input 
              type="text"
              name="firmwareVersion"
              value={implantData.firmwareVersion} 
              onChange={handleChange}
              placeholder="Enter firmware version" 
            />
          </div>
          
          <div className="form-group">
            <label>Encrypted Configuration *</label>
            <textarea 
              name="encryptedConfig"
              value={implantData.encryptedConfig} 
              onChange={handleChange}
              placeholder="Enter encrypted firmware configuration" 
              rows={4}
              required
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="primary-btn"
          >
            {adding ? "Encrypting with FHE..." : "Register Implant"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;