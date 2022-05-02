import Web3 from "web3"
import { abi } from "./abi"
import axios from "axios"
const {toBN, BN, fromWei, toWei} = Web3.utils

const maxAllowance = new BN("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)
export const isETH = (tokenAddress) => tokenAddress === "0x0000000000000000000000000000000000000000"
const _1e18 = toBN('10').pow(toBN('18'))

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
    const { web3, bammAddress, tokenAddress } = context
    const { Contract } = web3.eth
    const bamm = new Contract(abi.bamm, bammAddress)
  
    const [{amount: tokenValue}, {succ: success, value: collateralValue}] = await Promise.all([
      getUserInfo(context),
      bamm.methods.getCollateralValue().call()
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

const getApy = (rate) => {
  // Calculating the APY Using Rate Per Block
  // https://compound.finance/docs#protocol-math
  const blockIntrest = parseFloat(fromWei(rate))
  const blocksPerDay = 6570 // based on 4 blocks occurring every minute
  const daysPerYear = 365

  const APY = ((((blockIntrest * blocksPerDay + 1) ** daysPerYear - 1))) * 100
  return APY.toString()
}

const getUserShareInEth = async(context, share) => {
  const {web3, userAddress, bammAddress, masterChefAddress, wrapperAddress} = context
  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, bammAddress)
  const wrapper = new Contract(abi.wrapper, wrapperAddress)
  const fEthAddress = await wrapper.methods.fETH().call()
  const fETH = new Contract(abi.cToken, fEthAddress)
  
  const bammBal = await fETH.methods.balanceOf(bammAddress).call()
  const { value: bammCollBal, succ} = await bamm.methods.getCollateralValue().call()
  if(!succ){
    throw new Error("failed to get bamb collateral value")
  }
  const bammTotal = toBN(bammBal).add(toBN(bammCollBal))
  const bfEthAddress = await wrapper.methods.bfETH().call()
  const bfETH = new Contract(abi.erc20, bfEthAddress)
  const bfEthTotalSupply = await bfETH.methods.totalSupply().call() 
  const userFETHBal = toBN(bammTotal).mul(toBN(share)).div(toBN(bfEthTotalSupply)).toString()
  const fEth2EthExchangeRate = await fETH.methods.exchangeRateStored().call()
  const userShare = (toBN(userFETHBal).mul(toBN(fEth2EthExchangeRate))).div(_1e18)
  return userShare
}

export const usdToShare = async (context, withdrawAmount) => {
  const {decimals} = context
  const {amount: bammShare} = await getUserInfo(context)
  const depositEthAmount = await getUserShareInEth(context, bammShare)
  const share = toBN(denormlize(withdrawAmount, decimals)).mul(toBN(bammShare)).div(depositEthAmount)
  return share.toString()
}

export const withdraw = ({web3, wrapperAddress}, amountInShares) => {

  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapperAddress)
  return bammWrapper.methods.withdraw(amountInShares)
}

export const getUserShareInUsd = async(context) => {
  const {amount: bammShare} = await getUserInfo(context)
  const usdVal = await getUserShareInEth(context, bammShare)
  return usdVal.toString()
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
  const {web3, wrapper}  = context
  const { Contract } = web3.eth
  const bammWrapper = new Contract(abi.wrapper, wrapper)

  return bammWrapper.methods.withdraw("0")
}

export const getApr = async (context) => {
  const {web3, wrapperAddress, bammAddress, masterChefAddress, masterChefPID} = context
  const { Contract } = web3.eth

  const masterChef = new Contract(abi.masterChef, masterChefAddress)
  const bamm = new Contract(abi.bamm, bammAddress)
  const bammWrapper = new Contract(abi.wrapper, wrapperAddress)
  const fEthAddress = await bammWrapper.methods.fETH().call()
  const fETH = new Contract(abi.cToken, fEthAddress)
  const supplyRatePerBlock = await fETH.methods.supplyRatePerBlock().call()
  const lendingAPY = getApy(supplyRatePerBlock)
  // masterChef pickle reward
  
  const bammShare = await bamm.methods.balanceOf(masterChefAddress).call()
  const totalBammInEth = await getUserShareInEth(context, bammShare) 
  const totalAllocPoint = await masterChef.methods.totalAllocPoint().call()
  
  const {allocPoint} = await masterChef.methods.poolInfo(masterChefPID).call()
  
  const picklePerSecond = await masterChef.methods.picklePerSecond().call()
  const picklePriceInEth = (await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=pickle-finance&vs_currencies=ETH')).data["pickle-finance"].eth.toString()
  const pickleApy = toBN(allocPoint).mul(toBN(picklePerSecond)).div(toBN(totalAllocPoint)).mul(toBN((365 * 24 * 60 * 60).toString()))
  const picklApyInEth = pickleApy.mul(toBN(toWei(picklePriceInEth))).div(_1e18)
  const pickleApyForPool = parseInt((toBN(picklApyInEth).mul(toBN("10000")).div(toBN(totalBammInEth))).toString()) / 100

  // rari pool admin fee
  const borrowRatePerBlock = toWei(parseFloat(getApy(await fETH.methods.borrowRatePerBlock().call())).toFixed(18))
  const adminFeeMantissa = await fETH.methods.adminFeeMantissa().call()
  const adminFee = fromWei((toBN(borrowRatePerBlock).mul(toBN(adminFeeMantissa))).div(_1e18))
  
  return [
    { name: "Rari APY", value: lendingAPY },
    { name: "Rari admin fees", value: adminFee },
    { name: "Pickle Reward", value: pickleApyForPool}
  ]
}