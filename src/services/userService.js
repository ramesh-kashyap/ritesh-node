const { User, Investment,Income,Withdraw} = require("../models"); // Adjust path as needed
const { Op } = require("sequelize"); // ✅ Import Sequelize Operators
const nodemailer = require("nodemailer");

// Get user's VIP level

async function getVip(userId) {
    try {
        const user = await User.findByPk(userId);
        if (!user) return 0;

        const levelTeam = await myLevelTeamCount(user.id);
        const genTeam = {
            1: levelTeam[1] || [],
            2: levelTeam[2] || [],
            3: levelTeam[3] || []
        };

        // Count active users in gen1 and gen2+gen3 (no package amount check)
        const gen1Count = await User.count({
            where: {
                id: genTeam[1],
                active_status: "Active"
            }
        });

        const gen2_3Count = await User.count({
            where: {
                id: [...genTeam[2], ...genTeam[3]],
                active_status: "Active"
            }
        });

        const userBalance = await getBalance(userId);
        let vipLevel = 0;

        if (userBalance >= 30) {
            vipLevel = 1;
        }
        if (userBalance >= 500 && gen1Count >= 3 && gen2_3Count >= 6) {
            vipLevel = 2;
        }
        if (userBalance >= 2000 && gen1Count >= 10 && gen2_3Count >= 24) {
            vipLevel = 3;
        }
        if (userBalance >= 5000 && gen1Count >= 15 && gen2_3Count >= 48) {
            vipLevel = 4;
        }
        return vipLevel;

    } catch (error) {
        console.error("Error in getVip:", error);
        return 0;
    }
}

// Get user's level team count (downline up to 'level' generations)
async function myLevelTeamCount(userId, level = 3) {
    try {
        let currentLevelUsers = [userId];
        let team = {};
        for (let i = 1; i <= level; i++) {
            const downline = await User.findAll({
                attributes: ["id"],
                where: { sponsor: currentLevelUsers }
            });

            if (downline.length === 0) break;
            currentLevelUsers = downline.map(user => user.id);
            team[i] = currentLevelUsers;
        }

        return team;
    } catch (error) {
        console.error("Error in myLevelTeamCount:", error);
        return {};
    }
}

// Get user's balance (active investments)

async function getBalance(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) return 0;

    // 1) grab the raw sums (could be null)
    const [ totalCommissionRaw, investmentRaw, totalWithdrawRaw ] = 
      await Promise.all([
        Income.sum('comm', {
          where: { user_id: userId }
        }),
        Investment.sum('amount', {
          where: { user_id: userId, status: 'Active' }
        }),
        Withdraw.sum('amount', {
          where: {
            user_id: userId,
            status:   { [Op.ne]: 'Failed' }
          }
        })
      ]);

    // 2) coerce to Number, defaulting null/undefined → 0
    const totalCommission = Number(totalCommissionRaw  ?? 0);
    const investment     = Number(investmentRaw      ?? 0);
    const totalWithdraw  = Number(totalWithdrawRaw  ?? 0);

    // 3) Now the math will never be NaN
    const totalBalance = totalCommission + investment - totalWithdraw;

    // console.log("Balance:", totalBalance);
    return totalBalance;
  }
  catch (error) {
    console.error("Error in getBalance:", error);
    return 0;
  }
}

async function getPercentage(vipLevel) {
    try {
        let idx = (vipLevel==0)?1:vipLevel;
        const user = await Machine.findOne({where: {m_id: idx }});
        return user.m_return || 0;
    } catch (error) {
        console.error("Error in getBalance:", error);
        return 0;
    }
}


async function sendEmail(email, subject, data) {
    try {
        // ✅ Create a transporter using cPanel SMTP
        const transporter = nodemailer.createTransport({
            host: "mail.hypermesh.io", // Replace with your cPanel SMTP host
            port: 465, // Use 465 for SSL, 587 for TLS
            secure: true, // true for 465, false for 587
            auth: {
                user: "info@hypermesh.io", // Your email
                pass: "Mayank036$", // Your email password
            },
        });
        const mailOptions = {
            from: '"HyperMesh" <info@hypermesh.io>', // Replace with your email
            to: email,
            subject: subject,
            html: `<p>Hi ${data.name},</p>
                   <p>We’re inform you that a One-Time Password (OTP) has been generated for your account authentication. Please use the OTP below to continue with your verification process.</p>
                   <p>OTP: ${data.code}</p>`,
        };
        // ✅ Send the email
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.response);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

async function addLevelIncome(userId, amount) {
    try {
        const user = await User.findOne({ where: { id: userId } });
        if (!user) return false;

        let userMid = user.id;
        let sponsorId;
        let cnt = 1;
        let baseAmount = amount / 100;
        const rname = user.username;
        const fullname = user.name;

        while (userMid && userMid !== 1) {
            const sponsorUser = await User.findOne({ where: { id: userMid } });
            if (!sponsorUser) break;
            sponsorId = sponsorUser.sponsor;
            let sponsorStatus = "Pending";
            let vipLevel = 0;

            if (sponsorId) {
                const sponsorDetails = await User.findOne({ where: { id: sponsorId } });
                if (sponsorDetails) {
                    sponsorStatus = sponsorDetails.active_status;
                    vipLevel = await getVip(sponsorDetails.id);
                }
            }

            // Define multipliers for different VIP levels
            const multipliers = {
                1: [7, 5, 1, 0 , 0],
                2: [8, 6, 2, 1 ,0],
                3: [10, 6, 2 ,1 , 1 ],
                4: [12, 8, 3, 2 , 1],
                5: [15, 8, 3, 2 , 1],
            };
            const currentMultipliers = multipliers[vipLevel] || [7, 5, 1, 0 , 0]; // Default to VIP 1 multipliers

            let commission = 0;
            if (sponsorStatus === "Active" && vipLevel >= 1) {
                if (cnt === 1) commission = baseAmount * currentMultipliers[0];
                if (cnt === 2) commission = baseAmount * currentMultipliers[1];
                if (cnt === 3) commission = baseAmount * currentMultipliers[2];
                if (cnt === 4) commission = baseAmount * currentMultipliers[3];
                if (cnt === 5) commission = baseAmount * currentMultipliers[4];
            }
            if (sponsorId && cnt <= 5 && commission > 0) {
                // Insert income record
                await Income.create({
                    user_id: sponsorId,
                    user_id_fk: sponsorUser.username,
                    amt: amount,
                    comm: commission,
                    remarks: "Level Income",
                    level: cnt,
                    rname,
                    fullname,
                    ttime: new Date(),
                });

                // Update user balance
                await User.update(
                    { userbalance: sponsorUser.userbalance + commission },
                    { where: { id: sponsorId } }
                );
            }

            userMid = sponsorId;
            cnt++;
        }

        return true;
    } catch (error) {
        console.error("Error in addLevelIncome:", error);
        return false;
    }
}


module.exports = { getVip, myLevelTeamCount, getBalance,getPercentage,addLevelIncome,sendEmail };