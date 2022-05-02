
const poolsByChain = {

  "Arbitrum Testnet": [],
  "Arbitrum One": [
    {
      poolAddress: "0x51fBf83818e4Fa195fD5D395a63fCfB5C45d9565",
      tokenAddress: "0x0000000000000000000000000000000000000000",
      tokenName: "ETH",
      collateralName: "Rari",
      description: "Rari stability pool 44",
      decimals: 18,
      bammAddress: "0x94fd843E77fe67A18d52E0AD0C9713C5a9399ef4",
      rewardAddress: "0x965772e0E9c84b6f359c8597C891108DcF1c5B1A",
      wrapperAddress: "0xEb6276Fd4D8B05104AeF4246d84D7840CB964cC8",
      masterChefAddress: "0x7Ecc7163469F37b777d7B8F45A667314030ACe24",
      masterChefPID: 15
    },
  ],
}

export const getPools = (chain) => {
  return poolsByChain[chain] || []
}