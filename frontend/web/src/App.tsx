import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface EnergyData {
  id: number;
  name: string;
  energyUsage: string;
  efficiency: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface EnergyAnalysis {
  communityAvg: number;
  efficiencyScore: number;
  savingsPotential: number;
  recommendation: string;
  comparison: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [energyList, setEnergyList] = useState<EnergyData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingData, setCreatingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newEnergyData, setNewEnergyData] = useState({ name: "", usage: "", efficiency: "" });
  const [selectedEnergy, setSelectedEnergy] = useState<EnergyData | null>(null);
  const [decryptedUsage, setDecryptedUsage] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [partners] = useState([
    { name: "GreenTech Solutions", logo: "🌿" },
    { name: "EcoPower Inc", logo: "⚡" },
    { name: "Sustainable Energy Co", logo: "🌍" }
  ]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const energyDataList: EnergyData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          energyDataList.push({
            id: parseInt(businessId.replace('energy-', '')) || Date.now(),
            name: businessData.name,
            energyUsage: businessId,
            efficiency: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setEnergyList(energyDataList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createEnergyData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating energy data with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const usageValue = parseInt(newEnergyData.usage) || 0;
      const businessId = `energy-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, usageValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newEnergyData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newEnergyData.efficiency) || 0,
        0,
        "Energy Consumption Data"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setUserHistory(prev => [...prev, {
        type: 'create',
        name: newEnergyData.name,
        timestamp: Date.now(),
        usage: usageValue
      }]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Energy data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewEnergyData({ name: "", usage: "", efficiency: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingData(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setUserHistory(prev => [...prev, {
        type: 'decrypt',
        name: businessData.name,
        timestamp: Date.now(),
        usage: Number(clearValue)
      }]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const analyzeEnergy = (energy: EnergyData, decryptedUsage: number | null): EnergyAnalysis => {
    const usage = energy.isVerified ? (energy.decryptedValue || 0) : (decryptedUsage || 500);
    const efficiency = energy.publicValue1 || 5;
    
    const communityAvg = 750;
    const efficiencyScore = Math.min(100, Math.round((efficiency * 10) + (1000 - usage) / 20));
    const savingsPotential = Math.max(0, Math.round((usage - communityAvg) * 0.15));
    const comparison = Math.round((usage / communityAvg) * 100);
    
    let recommendation = "Excellent efficiency!";
    if (usage > communityAvg * 1.2) recommendation = "Consider energy audit";
    if (usage > communityAvg * 1.5) recommendation = "High savings potential";
    if (efficiency < 5) recommendation = "Upgrade to efficient appliances";

    return {
      communityAvg,
      efficiencyScore,
      savingsPotential,
      recommendation,
      comparison
    };
  };

  const renderStats = () => {
    const totalEntries = energyList.length;
    const verifiedEntries = energyList.filter(m => m.isVerified).length;
    const avgEfficiency = energyList.length > 0 
      ? energyList.reduce((sum, m) => sum + m.publicValue1, 0) / energyList.length 
      : 0;
    
    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <h3>Total Entries</h3>
          <div className="stat-value">{totalEntries}</div>
        </div>
        
        <div className="stat-card neon-blue">
          <h3>Verified Data</h3>
          <div className="stat-value">{verifiedEntries}/{totalEntries}</div>
        </div>
        
        <div className="stat-card neon-pink">
          <h3>Avg Efficiency</h3>
          <div className="stat-value">{avgEfficiency.toFixed(1)}/10</div>
        </div>
      </div>
    );
  };

  const renderEnergyChart = (energy: EnergyData, decryptedUsage: number | null) => {
    const analysis = analyzeEnergy(energy, decryptedUsage);
    
    return (
      <div className="energy-chart">
        <div className="chart-visual">
          <div className="usage-bar">
            <div 
              className="bar-fill usage" 
              style={{ width: `${Math.min(100, analysis.comparison)}%` }}
            >
              <span>Your Usage: {analysis.comparison}% of average</span>
            </div>
          </div>
          <div className="avg-line">
            <span>Community Average: {analysis.communityAvg} kWh</span>
          </div>
        </div>
        
        <div className="analysis-metrics">
          <div className="metric">
            <span className="label">Efficiency Score</span>
            <span className="value neon-green">{analysis.efficiencyScore}/100</span>
          </div>
          <div className="metric">
            <span className="label">Savings Potential</span>
            <span className="value neon-yellow">{analysis.savingsPotential} kWh/month</span>
          </div>
          <div className="metric">
            <span className="label">Recommendation</span>
            <span className="value">{analysis.recommendation}</span>
          </div>
        </div>
      </div>
    );
  };

  const filteredEnergyList = energyList.filter(energy =>
    energy.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 Confidential Energy Saving</h1>
          </div>
          <ConnectButton />
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="energy-icon">⚡</div>
            <h2>Connect to Start Energy Analysis</h2>
            <p>Protect your energy data with FHE encryption while comparing with community averages</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted energy system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🔐 Confidential Energy Saving</h1>
          <p>Encrypted energy comparison with FHE protection</p>
        </div>
        <div className="header-actions">
          <ConnectButton />
        </div>
      </header>

      <div className="main-content">
        <div className="content-panel left-panel">
          <div className="panel-header">
            <h2>🌿 Energy Statistics</h2>
            {renderStats()}
          </div>

          <div className="search-section">
            <input
              type="text"
              placeholder="🔍 Search energy entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="energy-list">
            <div className="list-header">
              <h3>Your Energy Data</h3>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="add-btn neon-button"
              >
                + Add Entry
              </button>
            </div>
            
            {filteredEnergyList.map((energy, index) => (
              <div 
                className={`energy-item ${selectedEnergy?.id === energy.id ? "selected" : ""}`}
                key={index}
                onClick={() => setSelectedEnergy(energy)}
              >
                <div className="item-header">
                  <span className="energy-name">{energy.name}</span>
                  <span className={`status ${energy.isVerified ? "verified" : "encrypted"}`}>
                    {energy.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                  </span>
                </div>
                <div className="item-details">
                  <span>Efficiency: {energy.publicValue1}/10</span>
                  <span>{new Date(energy.timestamp * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="user-history">
            <h3>📊 Your Activity</h3>
            {userHistory.slice(-5).map((item, index) => (
              <div key={index} className="history-item">
                <span>{item.type === 'create' ? '📝' : '🔓'}</span>
                <span>{item.name}</span>
                <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="content-panel right-panel">
          {selectedEnergy ? (
            <div className="energy-detail">
              <div className="detail-header">
                <h2>{selectedEnergy.name}</h2>
                <button onClick={() => setSelectedEnergy(null)} className="close-btn">×</button>
              </div>
              
              <div className="energy-info">
                <div className="info-row">
                  <span>Efficiency Score:</span>
                  <span className="value">{selectedEnergy.publicValue1}/10</span>
                </div>
                <div className="info-row">
                  <span>Energy Usage:</span>
                  <span className="value">
                    {selectedEnergy.isVerified ? 
                      `${selectedEnergy.decryptedValue} kWh (Verified)` : 
                      decryptedUsage !== null ? 
                      `${decryptedUsage} kWh (Decrypted)` : 
                      "🔒 FHE Encrypted"
                    }
                  </span>
                </div>
              </div>

              <button 
                className={`decrypt-btn ${selectedEnergy.isVerified ? 'verified' : ''}`}
                onClick={async () => {
                  const result = await decryptData(selectedEnergy.energyUsage);
                  if (result !== null) setDecryptedUsage(result);
                }}
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 selectedEnergy.isVerified ? "✅ Verified" : 
                 "🔓 Decrypt & Verify"}
              </button>

              {(selectedEnergy.isVerified || decryptedUsage !== null) && (
                <div className="analysis-section">
                  <h3>📈 Community Comparison</h3>
                  {renderEnergyChart(selectedEnergy, decryptedUsage)}
                </div>
              )}
            </div>
          ) : (
            <div className="welcome-panel">
              <h2>⚡ Welcome to Confidential Energy Saving</h2>
              <p>Add your energy usage data with FHE encryption to compare with community averages while maintaining privacy.</p>
              
              <div className="partners-section">
                <h3>Our Partners</h3>
                <div className="partners-grid">
                  {partners.map((partner, index) => (
                    <div key={index} className="partner-card">
                      <span className="partner-logo">{partner.logo}</span>
                      <span>{partner.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Add Energy Data</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Device Name</label>
                <input 
                  type="text"
                  value={newEnergyData.name}
                  onChange={(e) => setNewEnergyData({...newEnergyData, name: e.target.value})}
                  placeholder="e.g., Air Conditioner"
                />
              </div>
              
              <div className="form-group">
                <label>Energy Usage (kWh) - FHE Encrypted</label>
                <input 
                  type="number"
                  value={newEnergyData.usage}
                  onChange={(e) => setNewEnergyData({...newEnergyData, usage: e.target.value})}
                  placeholder="Monthly usage in kWh"
                />
              </div>
              
              <div className="form-group">
                <label>Efficiency Rating (1-10)</label>
                <input 
                  type="number"
                  min="1"
                  max="10"
                  value={newEnergyData.efficiency}
                  onChange={(e) => setNewEnergyData({...newEnergyData, efficiency: e.target.value})}
                  placeholder="1-10 scale"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button 
                onClick={createEnergyData}
                disabled={creatingData || !newEnergyData.name || !newEnergyData.usage}
                className="submit-btn"
              >
                {creatingData ? "Encrypting..." : "Add Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          {transactionStatus.message}
        </div>
      )}
    </div>
  );
};

export default App;

