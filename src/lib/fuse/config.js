// TODO add support for platform name, link, docs,

const poolsByChain = {

  "Arbitrum Testnet": [],
  "Arbitrum One": [
    {
      poolAddress: "0x51fBf83818e4Fa195fD5D395a63fCfB5C45d9565",
      tokenAddress: "0x0000000000000000000000000000000000000000",
      tokenName: "ETH",
      collateralName: "Rari",
      platformName: "Pickle Fuse Rari Something",
      decimals: 18,
      lensAddress: "0x539a3f6d1F33C77c83e9b159e23E99FD8C26e7D9",
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