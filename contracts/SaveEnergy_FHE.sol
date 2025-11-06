pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SaveEnergy_FHE is ZamaEthereumConfig {
    struct EnergyData {
        string householdId;
        euint32 encryptedConsumption;
        uint256 publicAreaCode;
        uint256 publicHouseholdSize;
        string description;
        address owner;
        uint256 timestamp;
        uint32 decryptedConsumption;
        bool isVerified;
    }

    mapping(string => EnergyData) public energyData;
    string[] public householdIds;

    event EnergyDataCreated(string indexed householdId, address indexed owner);
    event DecryptionVerified(string indexed householdId, uint32 decryptedConsumption);

    constructor() ZamaEthereumConfig() {
    }

    function createEnergyData(
        string calldata householdId,
        string calldata householdName,
        externalEuint32 encryptedConsumption,
        bytes calldata inputProof,
        uint256 publicAreaCode,
        uint256 publicHouseholdSize,
        string calldata description
    ) external {
        require(bytes(energyData[householdId].householdId).length == 0, "Energy data already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedConsumption, inputProof)), "Invalid encrypted input");

        energyData[householdId] = EnergyData({
            householdId: householdName,
            encryptedConsumption: FHE.fromExternal(encryptedConsumption, inputProof),
            publicAreaCode: publicAreaCode,
            publicHouseholdSize: publicHouseholdSize,
            description: description,
            owner: msg.sender,
            timestamp: block.timestamp,
            decryptedConsumption: 0,
            isVerified: false
        });

        FHE.allowThis(energyData[householdId].encryptedConsumption);
        FHE.makePubliclyDecryptable(energyData[householdId].encryptedConsumption);
        householdIds.push(householdId);

        emit EnergyDataCreated(householdId, msg.sender);
    }

    function verifyDecryption(
        string calldata householdId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(energyData[householdId].householdId).length > 0, "Energy data does not exist");
        require(!energyData[householdId].isVerified, "Data already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(energyData[householdId].encryptedConsumption);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));

        energyData[householdId].decryptedConsumption = decodedValue;
        energyData[householdId].isVerified = true;

        emit DecryptionVerified(householdId, decodedValue);
    }

    function getEncryptedConsumption(string calldata householdId) external view returns (euint32) {
        require(bytes(energyData[householdId].householdId).length > 0, "Energy data does not exist");
        return energyData[householdId].encryptedConsumption;
    }

    function getEnergyData(string calldata householdId) external view returns (
        string memory householdName,
        uint256 publicAreaCode,
        uint256 publicHouseholdSize,
        string memory description,
        address owner,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedConsumption
    ) {
        require(bytes(energyData[householdId].householdId).length > 0, "Energy data does not exist");
        EnergyData storage data = energyData[householdId];

        return (
            data.householdId,
            data.publicAreaCode,
            data.publicHouseholdSize,
            data.description,
            data.owner,
            data.timestamp,
            data.isVerified,
            data.decryptedConsumption
        );
    }

    function getAllHouseholdIds() external view returns (string[] memory) {
        return householdIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

