import Web3 from "web3"
import { abi } from "./abi"
import axios from "axios"
const {toBN, BN} = Web3.utils

const maxAllowance = new BN("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)
export const isETH = (tokenAddress) => tokenAddress === "0x0000000000000000000000000000000000000000"


export const normlize = (n, decimals) => {
  let wei = toBN(n); // eslint-disable-line
  const negative = wei.lt(toBN("0")); // eslint-disable-line
  const base = toBN("1" + ("0".repeat(decimals)))
  const options = {};

  if (negative) {
    wei = wei.mul(new BN(-1));
  }

  let fraction = wei.mod(base).toString(10); // eslint-disable-line

  while (fraction.length < decimals) {
    fraction = `0${fraction}`;
  }

  if (!options.pad) {
    fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1];
  }

  let whole = wei.div(base).toString(10); // eslint-disable-line

  if (options.commify) {
    whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  let value = `${whole}${fraction == '0' ? '' : `.${fraction}`}`; // eslint-disable-line

  if (negative) {
    value = `-${value}`;
  }

  return value;
}

export const denormlize = (n, decimals) => {
  const base = toBN("1" + ("0".repeat(decimals)))

  // Is it negative?
  const negative = (n.substring(0, 1) === '-') 
  if (negative) {
    n = n.substring(1)
  }

  if (n === '.') { throw new Error(`while converting number ${n} to wei, invalid value`) }

  // Split it into a whole and fractional part
  const comps = n.split('.') 
  if (comps.length > 2) { throw new Error(`[ethjs-unit] while converting number ${n} to wei,  too many decimal points`) }

  let whole = comps[0], fraction = comps[1] 

  if (!whole) { whole = '0' }
  if (!fraction) { fraction = '0' }
  if (fraction.length > decimals) { throw new Error(`[ethjs-unit] while converting number ${n} to wei, too many decimal places`) }

  while (fraction.length < decimals) {
    fraction += '0'
  }
  whole = new BN(whole)
  fraction = new BN(fraction)
  let wei = (whole.mul(base)).add(fraction)

  if (negative) {
    wei = wei.mul(new BN(-1))
  }

  return new BN(wei.toString(10), 10)
}

const GAS_LIMIT = { gasLimit: "1000000" }

export const getDecimals = ({web3, tokenAddress}) => {
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  return erc20.methods.decimals().call()
}

export const getAllowance = async ({web3, user, tokenAddress, poolAddress}) => {
  debugger
  if(isETH(tokenAddress)){
    return maxAllowance.toString()
  }
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  return await erc20.methods.allowance(user, poolAddress).call()
}

export const grantAllowance = ({web3, tokenAddress, poolAddress}) => {
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  
  return erc20.methods.approve(poolAddress, maxAllowance)
}

export const getWalletBallance = async ({web3, user, tokenAddress}) => {
  let balance
  if(isETH(tokenAddress)){
    balance = await web3.eth.getBalance(user)
  } else {
    const { Contract } = web3.eth
    const erc20 = new Contract(abi.erc20, tokenAddress)
    balance = await erc20.methods.balanceOf(user).call()
  }
  return balance
}

export const deposit = (context, amount) => {
  debugger
  const {web3, wrapperAddress, decimals, tokenAddress} = context
  if(isETH(tokenAddress)){
    return depositEth(context)
  }
  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapperAddress)
  const depositAmount = denormlize(amount, decimals)
  return bammWrapper.methods.deposit(depositAmount)
}

const depositEth = ({web3, wrapperAddress}) => {
  debugger
  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapperAddress)
  return bammWrapper.methods.deposit()
}

const userProxyCache = {}

const getUserProxy = async ({web3, user, wrapperAddress}) => {
  if(userProxyCache[user]){
    return userProxyCache[user]
  }
  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapperAddress)
  const proxyAccount = await bammWrapper.methods.proxies(user).call(GAS_LIMIT)
  if(proxyAccount){
    userProxyCache[user] = proxyAccount
  }
  return proxyAccount
}

const getUserInfo = async (context) => {
  const proxyAccount = await getUserProxy(context)
  const {web3, masterChefPID, masterChefAddress} = context
  const { Contract } = web3.eth
  const masterChef = new Contract(abi.masterChef, masterChefAddress)
  const userInfo = await masterChef.methods.userInfo(masterChefPID, proxyAccount).call(GAS_LIMIT)
  
  return userInfo
}

export const getTvl = async(context) => {
  try{
    const { web3, poolAddress, tokenAddress } = context
    const { Contract } = web3.eth
    // const bamm = new Contract(abi.bamm, poolAddress)
  
    const [{amount: tokenValue}, {succ: success, value: collateralValue}] = await Promise.all([
      getUserInfo(context),
      {succ: true, value: 0} // TODO: calc collateral value
    ])
    
    if(!success){
      throw new Error("getTvl: failed to fetch collateral value")
    }
    const tvl = toBN(tokenValue).add(toBN(collateralValue)).toString()
    let usdRatio, collRatio;
    if (tvl == "0"){
      usdRatio = "0"
      collRatio = "0"
    }else{
      usdRatio = normlize((toBN(tokenValue).mul(toBN(1e18))).div(toBN(tvl)).toString(), 18)
      collRatio = normlize((toBN(collateralValue).mul(toBN(1e18))).div(toBN(tvl)).toString(), 18)
    }

    return {
      tvl,
      usdRatio,
      collRatio
    }
  } catch(e) {
    console.error(e)
  }
}

const getUserShareAndTotalSupply = async(web3, userAddress, poolAddress) => {
  throw new Error(`function  not yet implemented`)

  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, poolAddress)
  const userSharePromise = bamm.methods.balanceOf(userAddress).call()
  const totalSupplyPromise = bamm.methods.totalSupply().call()

  const [userShare, totalSupply] = await Promise.all([
    userSharePromise,
    totalSupplyPromise
  ])
  return {userShare, totalSupply}
}

export const usdToShare = async (context, amount) => {
  throw new Error(`function  not yet implemented`)

  const {web3, poolAddress, tokenAddress, decimals} = context
  // amount * totalSupply / TVL
  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, poolAddress)
  const totalSupplyPromise = bamm.methods.totalSupply().call()
  const tvlPromise = getTvl(context)
  const [{tvl}, totalSupply] = await Promise.all([tvlPromise, totalSupplyPromise])
  const share = (toBN(denormlize(amount, decimals)).mul(toBN(totalSupply))).div(toBN(tvl))
  return share.toString()
}

export const withdraw = ({web3, wrapperAddress}, amountInShares) => {

  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapperAddress)
  return bammWrapper.methods.withdraw(amountInShares)
}

export const getUserShareInUsd = async(context) => {
  return "0" // TODO
  const {web3, user, poolAddress} = context
  // tvl * userShare / totalSupply
  const tvlPromise = getTvl(context)
  const sharePromise = getUserShareAndTotalSupply(web3, user, poolAddress)
  const [{tvl}, {userShare, totalSupply}] = await Promise.all([tvlPromise, sharePromise])
  
  let usdVal;
  if(totalSupply == "0"){
    usdVal = "0"
  } else {
    usdVal = (toBN(tvl).mul(toBN(userShare))).div(toBN(totalSupply)).toString()
  }
  
  return usdVal
}

export const getSymbol = (web3, tokenAddress) => {
  if (tokenAddress == "0x0000000000000000000000000000000000000000"){ // handel ETH
    return "ETH"
  }
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  return erc20.methods.symbol().call()
} 

export const getAssetDistrobution = async({web3, poolAddress, user}, assetAddress ) => {
  throw new Error(`function  not yet implemented`)

  let balancePromise;
  if (assetAddress == "0x0000000000000000000000000000000000000000"){ // handel ETH
    balancePromise = web3.eth.getBalance(poolAddress)
  } else {
    const { Contract } = web3.eth
    const erc20 = new Contract(abi.erc20, assetAddress)
    balancePromise = erc20.methods.balanceOf(user).call()
  }

  const [poolBalance, symbol] = await Promise.all([
    balancePromise,
    getSymbol(web3, assetAddress)
  ])

  return {
    assetAddress,
    poolBalance,
    symbol
  }
}

export const getCollaterals = async(context) => {
  return [] // TODO:
  const { web3, poolAddress } = context
  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, poolAddress)
  const promises = []
  for (let i = 0; i < 10; i++) {
    const promise = bamm.methods.collaterals(i).call()
    .then(address => getAssetDistrobution(context, address))
    .catch(err => null)
    promises.push(promise)
  }
  const collaterals = (await Promise.all(promises))
  .filter(x=> x)
  return collaterals
}

export const getReward = async(context) => {
  const {web3, user, masterChefAddress, masterChefPID, rewardAddress} = context

  const { Contract } = web3.eth
  const masterChef = new Contract(abi.masterChef, masterChefAddress)
  const erc20 = new Contract(abi.erc20, rewardAddress)
  const proxyAccount = await getUserProxy(context)
  const [reward, symbol, decimal, balance] = await Promise.all([
    masterChef.methods.pendingPickle(masterChefPID, proxyAccount).call(),
    getSymbol(web3, rewardAddress),
    getDecimals({web3, tokenAddress: rewardAddress}),
    erc20.methods.balanceOf(user).call()
  ])

  return {
    unclaimed: normlize(reward, decimal), 
    symbol,
    balance: normlize(balance, decimal), 
  }

}

export const claimReward = async (context) => {
  debugger
  const {web3, wrapper}  = context
  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapper)

  return bammWrapper.methods.withdraw("0")
}

export const getApr = async ({poolAddress: bammAddress, tokenAddress: vstTokenAddress, web3}) => {
  return '7.7'
  throw new Error(`function  not yet implemented`)

  // get vesta price
  const { Contract } = web3.eth
  const response = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=vesta-finance&vs_currencies=USD")
  const vestaPrice = Number(response.data["vesta-finance"]["usd"])

  const bammContract = new Contract(abi.bamm, bammAddress)
  
  const stabilityPoolAddress = await bammContract.methods.SP().call()
  const stabilityPoolContract = new Contract(abi.stabilityPool, stabilityPoolAddress)

  const communityIssuanceAddress = await stabilityPoolContract.methods.communityIssuance().call()
  const communityIssuanceContract = new Contract(abi.communityIssuance, communityIssuanceAddress)  

  const vestaPerMinute = Number(web3.utils.fromWei(await communityIssuanceContract.methods.vstaDistributionsByPool(stabilityPoolAddress).call()))
  const minutesPerYear = 365 * 24 * 60
  const vestaPerYearInUSD = vestaPerMinute * minutesPerYear * vestaPrice

  const vstContract = new Contract(abi.erc20, vstTokenAddress)
  const balanceOfSp = Number(web3.utils.fromWei(await vstContract.methods.balanceOf(stabilityPoolAddress).call()))

  //console.log({vestaPerYearInUSD}, {balanceOfSp}, {vestaPrice}, {minutesPerYear}, {vestaPerMinute})

  const apr = vestaPerYearInUSD * 100 / balanceOfSp

  console.log(bammAddress, {apr})

  return apr
}