const express = require('express');
const router = express.Router();
const authController = require('../controller/AuthController');
 const UserController = require('../controller/UserController');
 const tradeController = require('../controller/tradeController');
 const transactionController = require('../controller/transactionController');
const Helper = require('../helper/helper');

const authMiddleware = require("../middleware/authMiddleware"); // JWT Auth Middleware
const TeamController = require("../controller/TeamController"); 
const User = require('../models/User');
 
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgotPassword', authController.forgotPassword);
router.post('/sendForgotOtp', authController.sendForgotOtp);
router.post('/sendRegisterOtp', authController.sendRegisterOtp);


router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the authentication API' });
});                             
router.get('/user', authMiddleware, UserController.getUserDetails);
router.get('/levelteam',  authMiddleware,UserController.levelTeam);
router.get('/directeam',  authMiddleware,UserController.direcTeam);
router.get('/fetchwallet', authMiddleware, UserController.fetchwallet);
router.get('/dynamic-upi-callback', UserController.dynamicUpiCallback);
router.get('/availbal', authMiddleware, UserController.available_balance);
router.get('/withreq', authMiddleware, UserController.withreq);
router.post('/sendotp', authMiddleware, UserController.sendotp);
router.post('/process-withdrawal', authMiddleware, UserController.processWithdrawal);


router.get('/tradeOn', authMiddleware,tradeController.tradeOnJson);
router.get('/close-trade', authMiddleware,tradeController.stopTrade);
router.get('/fetchtrade', authMiddleware, tradeController.tradecount);

router.get('/fetchvip', authMiddleware, UserController.fetchvip);
router.post('/quality', authMiddleware, UserController.quality);
router.post('/submitserver', authMiddleware, UserController.submitserver);
router.get('/fetchrenew', authMiddleware, UserController.fetchrenew);
router.post('/renew-server', authMiddleware, UserController.renewserver);
router.get('/investments', authMiddleware, UserController.InvestHistory);
router.get('/withdraw-history', authMiddleware, UserController.withdrawHistory);
router.post('/changePassword', authMiddleware, UserController.ChangePassword);

router.get('/fetchservers', authMiddleware, UserController.fetchservers);
router.post('/save-address/:networkType', authMiddleware, UserController.saveWalletAddress);

router.get('/getUserHistory', authMiddleware, transactionController.getUserHistory);

router.post('/sendtrade', authMiddleware, UserController.sendtrade);
router.get('/runingtrade', authMiddleware, UserController.runingtrade);
router.get('/getinvate', authMiddleware, TeamController.Getinvate);
router.get("/team", authMiddleware ,TeamController.getTeam);
router.get("/getTeamRecord", authMiddleware ,TeamController.getTeamRecord);

router.get('/list', authMiddleware,TeamController.listUsers);
router.get('/serverc', authMiddleware, UserController.serverc);
router.post('/getTradeIncomes', authMiddleware, UserController.tradeinc);
router.get('/totalRef', authMiddleware, UserController.totalRef);
router.post('/ChangeMail', authMiddleware,authController.changeMail);
 

router.post('/txnPassword',  UserController.ChangePassword);

router.post('/sendnotice', authMiddleware, Helper.addNotification);
router.get('/fetchnotice', authMiddleware, UserController.fetchnotice);

// router.post('/register', (req, res) => {
//   res.json({ message: 'Welcome to regiset' });
// });

module.exports = router;
