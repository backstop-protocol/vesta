import Web3 from "web3"
import { abi } from "./abi"
const {toBN, BN} = Web3.utils

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
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  return await erc20.methods.allowance(user, poolAddress).call()
}

export const grantAllowance = ({web3, tokenAddress, poolAddress}) => {
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  const maxAllowance = new  BN("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)
  return erc20.methods.approve(poolAddress, maxAllowance)
}

export const getWalletBallance = async ({web3, user, tokenAddress, decimals}) => {
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  const balance = await erc20.methods.balanceOf(user).call()
  return balance
}

export const getPoolBallance = async ({web3, tokenAddress, poolAddress}) => {
  const { Contract } = web3.eth
  const erc20 = new Contract(abi.erc20, tokenAddress)
  const [token, eth] = await Promise.all([
    erc20.methods.balanceOf(poolAddress).call(GAS_LIMIT), 
    web3.eth.getBalance(tokenAddress)
  ])
  return {
    token, 
    eth
  }
}

export const deposit = ({web3, poolAddress, decimals}, amount) => {
  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, poolAddress)
  const depositAmount = denormlize(amount, decimals)
  return bamm.methods.deposit(depositAmount)
}



const getLensUserInfo = async ({web3, user, lensAddress, rewardAddress, poolAddress}) => {
  const { Contract } = web3.eth
  const lens = new Contract(abi.lens, lensAddress)
  return lens.methods.getUserInfo(user, poolAddress, rewardAddress).call(GAS_LIMIT)
}

export const getTvl = async(context) => {
  const { web3, poolAddress, tokenAddress, decimals, lensAddress } = context
  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, poolAddress)
  const erc20 = new Contract(abi.erc20, tokenAddress)
  let tokenValuePromise;
  if(true){
    tokenValuePromise = getLensUserInfo(context)
    .then(({lusdTotal})=> {
      return lusdTotal
    })
    .catch(err => {
      console.error(err)
    })
  } else {
    tokenValuePromise = erc20.methods.balanceOf(poolAddress).call()
  }
  const [tokenValue, {succ: success, value: collateralValue}] = await Promise.all([
    tokenValuePromise,
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
}

const getUserShareAndTotalSupply = async(web3, userAddress, poolAddress) => {
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

export const withdraw = ({web3, poolAddress, tokenAddress, decimals}, amountInShares) => {
  const { Contract } = web3.eth
  const bamm = new Contract(abi.bamm, poolAddress)
  return bamm.methods.withdraw(amountInShares)
}

export const getUserShareInUsd = async(context) => {
  const {web3, user, poolAddress, tokenAddress, decimals} = context
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

export const getReward = async({web3, user, lensAddress, poolAddress, rewardAddress}) => {
  // todo fetch unclaimed reward
  if(!lensAddress){ 
    return null
  }
  const { Contract } = web3.eth
  const lens = new Contract(abi.lens, lensAddress)
  const erc20 = new Contract(abi.erc20, rewardAddress)
  const [reward, symbol, decimal, balance] = await Promise.all([
    lens.methods.getUnclaimedLqty(user, poolAddress, rewardAddress).call(),
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

export const getApr = async ({poolAddress: bammAddress, tokenAddress: vstTokenAddress, web3}) => {
  // get vesta price
  const response = await require("axios").get("https://api.coingecko.com/api/v3/simple/price?ids=vesta-finance&vs_currencies=USD")
  const vestaPrice = Number(response.data["vesta-finance"]["usd"])


  const bammAbi = [{"inputs":[{"internalType":"address","name":"_priceAggregator","type":"address"},{"internalType":"address payable","name":"_SP","type":"address"},{"internalType":"address","name":"_LUSD","type":"address"},{"internalType":"address","name":"_LQTY","type":"address"},{"internalType":"address","name":"_collateral","type":"address"},{"internalType":"uint256","name":"_maxDiscount","type":"uint256"},{"internalType":"address payable","name":"_feePool","type":"address"},{"internalType":"address","name":"_fronEndTag","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"val","type":"uint256"}],"name":"Exit","type":"event"},{"anonymous":false,"inputs":[],"name":"Flee","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"val","type":"uint256"}],"name":"Join","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"A","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"fee","type":"uint256"}],"name":"ParamsSet","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"lusdAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"ethAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"RebalanceSwap","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"dst","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Tack","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_from","type":"address"},{"indexed":true,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"lusdAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"numShares","type":"uint256"}],"name":"UserDeposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"lusdAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"ethAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"numShares","type":"uint256"}],"name":"UserWithdraw","type":"event"},{"inputs":[],"name":"A","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"LUSD","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MAX_A","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MAX_FEE","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MIN_A","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"PRECISION","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"SP","outputs":[{"internalType":"contract StabilityPoolLike","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"add","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"balance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"bonus","outputs":[{"internalType":"contract ERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"collateral","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"collaterals","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"crops","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"dec","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lusdAmount","type":"uint256"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feePool","outputs":[{"internalType":"address payable","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fetchPrice","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"frontEndTag","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"gem","outputs":[{"internalType":"contract ERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getCollateralBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getCollateralValue","outputs":[{"internalType":"bool","name":"succ","type":"bool"},{"internalType":"uint256","name":"value","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"","type":"address"},{"internalType":"contract IERC20","name":"","type":"address"},{"internalType":"uint256","name":"srcQty","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"getConversionRate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"xQty","type":"uint256"},{"internalType":"uint256","name":"xBalance","type":"uint256"},{"internalType":"uint256","name":"yBalance","type":"uint256"},{"internalType":"uint256","name":"A","type":"uint256"}],"name":"getReturn","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"},{"internalType":"uint256","name":"A","type":"uint256"}],"name":"getSumFixedPoint","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"lusdQty","type":"uint256"}],"name":"getSwapEthAmount","outputs":[{"internalType":"uint256","name":"ethAmount","type":"uint256"},{"internalType":"uint256","name":"feeLusdAmount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"ilk","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isOwner","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxDiscount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"mul","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"nav","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"nps","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"priceAggregator","outputs":[{"internalType":"contract AggregatorV3Interface","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"rdiv","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"rmul","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"rmulup","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"_A","type":"uint256"},{"internalType":"uint256","name":"_fee","type":"uint256"}],"name":"setParams","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"share","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"stake","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"stock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"sub","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"lusdAmount","type":"uint256"},{"internalType":"uint256","name":"minEthReturn","type":"uint256"},{"internalType":"address payable","name":"dest","type":"address"}],"name":"swap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"total","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"","type":"address"},{"internalType":"uint256","name":"srcAmount","type":"uint256"},{"internalType":"contract IERC20","name":"","type":"address"},{"internalType":"address payable","name":"destAddress","type":"address"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bool","name":"","type":"bool"}],"name":"trade","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"vat","outputs":[{"internalType":"contract VatLike","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"wdiv","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"wdivup","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"numShares","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"wmul","outputs":[{"internalType":"uint256","name":"z","type":"uint256"}],"stateMutability":"pure","type":"function"},{"stateMutability":"payable","type":"receive"}]
  const bammContract = new web3.eth.Contract(bammAbi, bammAddress)
  
  const stabilityPoolAddress = await bammContract.methods.SP().call()
  const stabilityPoolAbi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_depositor","type":"address"},{"indexed":false,"internalType":"uint256","name":"_Asset","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_VSTLoss","type":"uint256"}],"name":"AssetGainWithdrawn","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"AssetSent","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newBorrowerOperationsAddress","type":"address"}],"name":"BorrowerOperationsAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newCommunityIssuanceAddress","type":"address"}],"name":"CommunityIssuanceAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newDefaultPoolAddress","type":"address"}],"name":"DefaultPoolAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_depositor","type":"address"},{"indexed":false,"internalType":"uint256","name":"_P","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_S","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_G","type":"uint256"}],"name":"DepositSnapshotUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint128","name":"_currentEpoch","type":"uint128"}],"name":"EpochUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_G","type":"uint256"},{"indexed":false,"internalType":"uint128","name":"_epoch","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"_scale","type":"uint128"}],"name":"G_Updated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_P","type":"uint256"}],"name":"P_Updated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_S","type":"uint256"},{"indexed":false,"internalType":"uint128","name":"_epoch","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"_scale","type":"uint128"}],"name":"S_Updated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint128","name":"_currentScale","type":"uint128"}],"name":"ScaleUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newSortedTrovesAddress","type":"address"}],"name":"SortedTrovesAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_newBalance","type":"uint256"}],"name":"StabilityPoolAssetBalanceUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_newBalance","type":"uint256"}],"name":"StabilityPoolVSTBalanceUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_newSystemStake","type":"uint256"},{"indexed":false,"internalType":"address","name":"_depositor","type":"address"}],"name":"StakeChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"_P","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_G","type":"uint256"}],"name":"SystemSnapshotUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newTroveManagerAddress","type":"address"}],"name":"TroveManagerAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_depositor","type":"address"},{"indexed":false,"internalType":"uint256","name":"_newDeposit","type":"uint256"}],"name":"UserDepositChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_depositor","type":"address"},{"indexed":false,"internalType":"uint256","name":"_VSTA","type":"uint256"}],"name":"VSTAPaidToDepositor","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newVSTTokenAddress","type":"address"}],"name":"VSTTokenAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newAddress","type":"address"}],"name":"VaultParametersBaseChanged","type":"event"},{"inputs":[],"name":"DECIMAL_PRECISION","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"ETH_REF_ADDRESS","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"NAME","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"P","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"SCALE_FACTOR","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"borrowerOperations","outputs":[{"internalType":"contract IBorrowerOperations","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"communityIssuance","outputs":[{"internalType":"contract ICommunityIssuance","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"currentEpoch","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"currentScale","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"depositSnapshots","outputs":[{"internalType":"uint256","name":"S","type":"uint256"},{"internalType":"uint256","name":"P","type":"uint256"},{"internalType":"uint256","name":"G","type":"uint256"},{"internalType":"uint128","name":"scale","type":"uint128"},{"internalType":"uint128","name":"epoch","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"deposits","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint128","name":"","type":"uint128"},{"internalType":"uint128","name":"","type":"uint128"}],"name":"epochToScaleToG","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint128","name":"","type":"uint128"},{"internalType":"uint128","name":"","type":"uint128"}],"name":"epochToScaleToSum","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAssetBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getCompoundedTotalStake","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_depositor","type":"address"}],"name":"getCompoundedVSTDeposit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_depositor","type":"address"}],"name":"getDepositorAssetGain","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_depositor","type":"address"}],"name":"getDepositorVSTAGain","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_asset","type":"address"}],"name":"getEntireSystemColl","outputs":[{"internalType":"uint256","name":"entireSystemColl","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_asset","type":"address"}],"name":"getEntireSystemDebt","outputs":[{"internalType":"uint256","name":"entireSystemDebt","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getName","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"pure","type":"function"},{"inputs":[],"name":"getTotalVSTDeposits","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lastAssetError_Offset","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lastVSTAError","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lastVSTLossError_Offset","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_debtToOffset","type":"uint256"},{"internalType":"uint256","name":"_collToAdd","type":"uint256"}],"name":"offset","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"provideToSP","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_asset","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"receivedERC20","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_assetAddress","type":"address"},{"internalType":"address","name":"_borrowerOperationsAddress","type":"address"},{"internalType":"address","name":"_troveManagerAddress","type":"address"},{"internalType":"address","name":"_vstTokenAddress","type":"address"},{"internalType":"address","name":"_sortedTrovesAddress","type":"address"},{"internalType":"address","name":"_communityIssuanceAddress","type":"address"},{"internalType":"address","name":"_vestaParamsAddress","type":"address"}],"name":"setAddresses","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_vaultParams","type":"address"}],"name":"setVestaParameters","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"sortedTroves","outputs":[{"internalType":"contract ISortedTroves","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"systemSnapshots","outputs":[{"internalType":"uint256","name":"S","type":"uint256"},{"internalType":"uint256","name":"P","type":"uint256"},{"internalType":"uint256","name":"G","type":"uint256"},{"internalType":"uint128","name":"scale","type":"uint128"},{"internalType":"uint128","name":"epoch","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalStakes","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"troveManager","outputs":[{"internalType":"contract ITroveManager","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"vestaParams","outputs":[{"internalType":"contract IVestaParameters","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"vstToken","outputs":[{"internalType":"contract IVSTToken","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_upperHint","type":"address"},{"internalType":"address","name":"_lowerHint","type":"address"}],"name":"withdrawAssetGainToTrove","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"withdrawFromSP","outputs":[],"stateMutability":"nonpayable","type":"function"},{"stateMutability":"payable","type":"receive"}]
  const stabilityPoolContract = new web3.eth.Contract(stabilityPoolAbi, stabilityPoolAddress)

  const communityIssuanceAbi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_stabilityPoolAddress","type":"address"}],"name":"StabilityPoolAddressSet","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"stabilityPool","type":"address"},{"indexed":false,"internalType":"uint256","name":"_totalVSTAIssued","type":"uint256"}],"name":"TotalVSTAIssuedUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_VSTATokenAddress","type":"address"}],"name":"VSTATokenAddressSet","type":"event"},{"inputs":[],"name":"DECIMAL_PRECISION","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"ISSUANCE_FACTOR","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"NAME","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"SECONDS_IN_ONE_MINUTE","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"VSTASupplyCaps","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_pool","type":"address"},{"internalType":"uint256","name":"_assignedSupply","type":"uint256"}],"name":"addFundToStabilityPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_pool","type":"address"},{"internalType":"uint256","name":"_assignedSupply","type":"uint256"},{"internalType":"address","name":"_spender","type":"address"}],"name":"addFundToStabilityPoolFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"adminContract","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"deploymentTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isInitialized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"issueVSTA","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"lastUpdateTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_account","type":"address"},{"internalType":"uint256","name":"_VSTAamount","type":"uint256"}],"name":"sendVSTA","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_vstaTokenAddress","type":"address"},{"internalType":"address","name":"_stabilityPoolManagerAddress","type":"address"},{"internalType":"address","name":"_adminContract","type":"address"}],"name":"setAddresses","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"stabilityPoolManager","outputs":[{"internalType":"contract IStabilityPoolManager","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"totalVSTAIssued","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_target","type":"address"},{"internalType":"address","name":"_receiver","type":"address"},{"internalType":"uint256","name":"_quantity","type":"uint256"}],"name":"transferFunToAnotherStabilityPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"vstaDistributionsByPool","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"vstaToken","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"}]
  const communityIssuanceAddress = await stabilityPoolContract.methods.communityIssuance().call()
  const communityIssuanceContract = new web3.eth.Contract(communityIssuanceAbi, communityIssuanceAddress)  

  const vestaPerMinute = Number(web3.utils.fromWei(await communityIssuanceContract.methods.vstaDistributionsByPool(stabilityPoolAddress).call()))
  const minutesPerYear = 365 * 24 * 60
  const vestaPerYearInUSD = vestaPerMinute * minutesPerYear * vestaPrice

  const tokenAbi = [{"inputs":[{"internalType":"address","name":"_troveManagerAddress","type":"address"},{"internalType":"address","name":"_stabilityPoolManagerAddress","type":"address"},{"internalType":"address","name":"_borrowerOperationsAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newBorrowerOperationsAddress","type":"address"}],"name":"BorrowerOperationsAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_asset","type":"address"},{"indexed":false,"internalType":"bool","name":"state","type":"bool"}],"name":"EmergencyStopMintingCollateral","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_newStabilityPoolAddress","type":"address"}],"name":"StabilityPoolAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_troveManagerAddress","type":"address"}],"name":"TroveManagerAddressChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_user","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"VSTTokenBalanceUpdated","type":"event"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"borrowerOperationsAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_account","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"burn","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"chainId","outputs":[{"internalType":"uint256","name":"chainID","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_asset","type":"address"},{"internalType":"bool","name":"status","type":"bool"}],"name":"emergencyStopMinting","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"emergencyStopMintingCollateral","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_asset","type":"address"},{"internalType":"address","name":"_account","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_poolAddress","type":"address"},{"internalType":"address","name":"_receiver","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"returnFromPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_sender","type":"address"},{"internalType":"address","name":"_poolAddress","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"sendToPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"stabilityPoolManager","outputs":[{"internalType":"contract IStabilityPoolManager","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"troveManagerAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]
  const vstContract = new web3.eth.Contract(tokenAbi, vstTokenAddress)
  const balanceOfSp = Number(web3.utils.fromWei(await vstContract.methods.balanceOf(stabilityPoolAddress).call()))

  //console.log({vestaPerYearInUSD}, {balanceOfSp}, {vestaPrice}, {minutesPerYear}, {vestaPerMinute})

  const apy = vestaPerYearInUSD * 100 / balanceOfSp

  console.log(bammAddress, {apy})

  return apy
}