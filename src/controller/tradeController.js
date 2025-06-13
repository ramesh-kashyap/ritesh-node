const axios     = require('axios');
const moment    = require('moment-timezone');
const NodeCache = require('node-cache');
const coinCache = new NodeCache({ stdTTL: 60 }); // cache for 60s
const {
  User,
  Contract,
  Variable,
  Machine,
  Income,
  sequelize,      // if you need transactions
} = require('../models');

const { Op } = require('sequelize');
const { getVip,getBalance,addLevelIncome} = require("../services/userService");



async function coinrates() {
  const cached = coinCache.get('coin_rates');
  if (cached) return cached;

  try {
    const resp = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: 'bitcoin,ethereum,tether,binancecoin,cardano,solana,dogecoin,xrp,tron',
          vs_currencies: 'usd'
        },
        timeout: 10_000
      }
    );

    const data = resp.data;
    const prices = {
      eth:  data.ethereum?.usd  || 0,
      btc:  data.bitcoin?.usd   || 0,
      bnb:  data.binancecoin?.usd|| 0,
      usdt: data.tether?.usd    || 0,
      trx:  data.tron?.usd      || 0,
      doge: data.dogecoin?.usd  || 0,
      sol:  data.solana?.usd    || 0,
      xrp:  data.xrp?.usd       || 0,
      car:  data.cardano?.usd   || 0
    };

    coinCache.set('coin_rates', prices);
    return prices;
  } catch (err) {
    console.error('Coin API error:', err);
    return { error: 'Coin API request failed' };
  }
}


const myLevelTeamCount = async (userId, level = 3) => {
    let arrin = [userId];
    let ret = {};
    let i = 1;
    
    while (arrin.length > 0) {
        const allDown = await User.findAll({
            attributes: ['id'],
            where: { sponsor: { [Op.in]: arrin } }
        });

        if (allDown.length > 0) {
            arrin = allDown.map(user => user.id);
            ret[i] = arrin;
            i++;
            if (i > level) break;
        } else {
            arrin = [];
        }
    }
    return ret;
};


const stopTrade = async (req, res) => {
  try {
    const user = req.user; // assuming you're using middleware to authenticate and attach user to req

    if (!user) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const contract = await Contract.findOne({
      where: {
        user_id: user.id,
        c_status: 1
      }
    });

    if (!contract) {
      return res.status(404).json({ status: false, message: "Active contract not found" });
    }

    // Update contract status
    contract.c_status = -1;
    await contract.save();

    // Record income
    const incomeData = {
      remarks: 'Order Revenue',
      comm: contract.profit,
      amt: contract.c_ref,
      invest_id: contract.id,
      level: 0,
      ttime: moment().format('YYYY-MM-DD'),
      user_id_fk: user.username,
      user_id: user.id
    };

    await Income.create(incomeData);

    // Add level income
    await addLevelIncome(user.id, contract.profit);

    // Return success response
    return res.json({
      status: true,
      profit: contract.profit
    });

  } catch (error) {
    console.error("stopTrade error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


// controllers/tradeController.js

const tradeOnJson = async (req, res) => {
  try {
    const user = req.user;

    
    // moment.tz.setDefault('Asia/Kolkata');
    const todayStr = new Date().toISOString().split("T")[0];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 1️⃣ Prevent double‐trading
    const pending = await Contract.findOne({
      where: { user_id: user.id, c_status: 1 }
    });
    if (pending) {
      return res.json({
        success: false,
        code: 'PENDING_TRADE',
        message: 'You already have a pending trade.'
      });
    }

    // 2️⃣ Build your 3-gen team counts
    const levels      = await myLevelTeamCount(user.id);
    const gen1Active  = (levels[1] || []).length; // or filter by active_status
    const gen2Active  = (levels[2] || []).length;
    const gen3Active  = (levels[3] || []).length;
    const totalTeam   = gen2Active + gen3Active;

    // 3️⃣ Compute balances & directs
    const userDirect = await User.count({
      where: {
        sponsor: user.id,
        active_status: 'Active',
        package: { [Op.gte]: 50 }
      }
    });
    const balance   = await getBalance(user.id);
    // console.log('balance'+balance);

    if (balance < 30) {
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_FUNDS',
        message: 'Insufficient funds to start a trade.'
      });
    }

    // 4️⃣ Determine allowed trades today
    let quantifiable = 6;


   const todayCount = await Contract.count({
        where: {
            user_id: user.id,
            ttime: {
            [Op.between]: [startOfDay, endOfDay]
            }
        }
        });

    console.log("todayCount"+todayCount);
    
    if (todayCount >= quantifiable) {
      return res.json({
        success: false,
        code: 'NO_TRADES_LEFT',
        message: 'You have used up your trades for today.'
      });
    }

    // 5️⃣ Update front-end remaining‐trade amount
    const todaySum    = await Contract.sum('profit', {
      where: { user_id: user.id, ttime: todayStr }
    }) || 0;
    const remaining   = balance - todaySum;
    const perTrade    = remaining / quantifiable;
    const tradesLeft  = quantifiable - (todayCount + 1);
    const updateAmt   = perTrade * tradesLeft;
    await user.update({ tradeAmt: updateAmt });

    // 6️⃣ Fetch & bump factor index
    let vars     = await Variable.findOne({ where: { v_id: 11 } });
    let tIndex   = vars.trade_index;
    if (tIndex < 0) throw new Error('Invalid trade_index');
    if (tIndex === 15) tIndex = 0;

    const factorArr = [435,193,146,193,435,146,193,146,435,435,146,193,193,146,435];
    const factor    = factorArr[tIndex];
    await vars.update({ trade_index: tIndex + 1 });

    // 7️⃣ Get coin rates
    const prices = await coinrates();
    if (prices.error) throw new Error(prices.error);

    // 8️⃣ Choose machine tier
    let uStr = balance;

    console.log('balance'+uStr);
    
    let idx = 0;
    if (uStr >= 30) idx = 1;
    if (uStr>=500  && gen1Active>=3  && totalTeam>=6)   idx = 2;
    if (uStr>=2000 && gen1Active>=10  && totalTeam>=24)  idx = 3;
    if (uStr>=5000 && gen1Active>=15 && totalTeam>=48)  idx = 4;

    // 9️⃣ Decide Buy vs Sell
    const zeroArr = ["eth","doge","btc","btc","bnb","btc","eth","eth","btc","btc","bnb","btc","eth","btc","eth","car"];
    const vIndex  = vars.v_index;
    const trade   = (vIndex % 2 === 0) ? 'Sell' : 'Buy';
    const newV    = (vIndex === 15) ? 0 : vIndex + 1;
    await vars.update({ v_index: newV });

    const sym = zeroArr[vIndex];
    const bot = await Machine.findOne({ where: { m_id: idx } });
    if (!bot) {
      return res.json({
        success: false,
        code: 'NO_BOT_FOUND',
        message: 'No trading bot available for your tier.'
      });
    }

    //  🔟 Compute prices & profit
    const pct     = parseFloat((bot.m_return / factor).toFixed(5));
    const usdPool = uStr * 0.7;
    const base    = parseFloat(prices[sym]);

    const buyBtc  = parseFloat((base - (base * pct/100)).toFixed(5));
    const sellBtc = parseFloat((base + (base * pct/100)).toFixed(5));
    const qty     = usdPool / (trade==='Buy' ? buyBtc : sellBtc);
    let   profit  = usdPool * pct;
    const refPool = uStr * 0.3 * pct;
    const nowTS   = moment().format('YYYY-MM-DD HH:mm:ss');

    // cap final-trade ROI
    if (todayCount === quantifiable - 1) {
      const maxRoi = (balance - todaySum) * (bot.m_return/100);
      const extra  = maxRoi - (todaySum + profit);
      profit += extra;
      await user.update({ last_trade: nowTS });
    }

    // 1️⃣1️⃣ Insert the trade
    const contract = await Contract.create({
      user_id:    user.id,
      trade:      trade,
      c_bot:      bot.m_name,
      c_buy:      trade==='Buy'  ? buyBtc  : sellBtc,
      c_sell:     trade==='Buy'  ? sellBtc : buyBtc,
      qty:        qty,
      profit:     profit,
      c_name:     sym,
      c_status:   1,
      c_ref:      refPool,
      created_at: nowTS,
      ttime:      nowTS
    });

    // ✅ Success JSON
    return res.json({
      success: true,
      code: 'TRADE_PLACED',
      data: {
        contractId: contract.id,
        trade:      trade,
        bot:        bot.m_name,
        qty,
        profit,
        c_name:     sym,
        remainingTrades: quantifiable - (todayCount + 1)
      }
    });

  } catch (err) {
    console.error('tradeOnJson error:', err);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: err.message
    });
  }
};

module.exports = { tradeOnJson,stopTrade};