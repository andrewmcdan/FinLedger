const db = require("../db/db");
const { isAdmin } = require("./users");

function listAccounts(userId, token) {
    let query = "SELECT * FROM accounts";
    const params = [];
    if (!isAdmin(userId, token) && !isManager(userId, token)) {
        query += " WHERE owner_id = $1";
        params.push(userId);
    }
    return db.query(query, params);
}

async function createAccount(ownerId, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, openingBalance, debit, credit, accountOrder, statementType, comments) {
    const accountNumber = await generateNewAccountNumber();
    const statementTypeMap = {
        "Income Statement": "IS",
        "Balance Sheet": "BS",
        "Retained Earnings Statement": "RE",
        IS: "IS",
        BS: "BS",
        RE: "RE",
    };
    const normalizedStatementType = statementTypeMap[statementType];
    if (!normalizedStatementType) {
        throw new Error(`Invalid statement type: ${statementType}`);
    }
    
    try {
        const query = `
        INSERT INTO accounts 
        (user_id, account_name, account_description, normal_side, account_category, account_subcategory, balance, debit, credit, account_order, statement_type, comment, account_number) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
        RETURNING *`;
        const params = [ownerId, 
            accountName, accountDescription, normalSide, accountCategory, accountSubcategory, openingBalance, debit, credit, accountOrder, normalizedStatementType, comments, accountNumber];
        const result = await db.query(query, params);
        const error = result?.error;
        if (result.rows.length === 0) {
            throw new Error("Account creation failed. Error: " + error.message);
        }
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

function generateNewAccountNumber() {
    const prefix = new Date().toISOString().slice(0, 7).replace("-", "");
    const randomNumber = Math.floor(100000 + Math.random() * 90000000);
    const paddedRandomNumber = String(randomNumber).padStart(8, "0");
    const newNumber = Number(`${prefix}${paddedRandomNumber}`);
    return db.query("SELECT COUNT(*) FROM accounts WHERE account_number = $1", [newNumber]).then((result) => {
        if (parseInt(result.rows[0].count, 10) > 0) {
            return generateNewAccountNumber();
        }
        return newNumber;
    });
}

module.exports = {
    listAccounts,
    createAccount,
};
