const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// app.get('/', (req, res) => res.send('FinLedger server is running'));

// wire in static files found in ../public/
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});