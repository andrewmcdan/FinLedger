const db = require("../db/db");
const {isAdmin} = require("./users");

function listAccounts(userId) {
    let query = "SELECT * FROM accounts";
    const params = [];
    if (!isAdmin(userId) && !isManager(userId)) {
        query += " WHERE owner_id = $1";
        params.push(userId);
    }
    return db.query(query, params);
}

module.exports = {
    listAccounts
};