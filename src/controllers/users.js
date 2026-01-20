/**
 * This file contains functions relevant to user management.
 */


// Placeholder function to check if a user is logged in. This should interface with the database functions in ../db/db.js
const getUserLoggedInStatus = (user_id, token) => {
    // TODO: query the database to check if the user with user_id is logged in, using the token for verification
    // return true if logged in, false otherwise
    return true; // placeholder
}

module.exports = {
    getUserLoggedInStatus,
};