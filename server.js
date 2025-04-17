const http = require('http');
const WebSocket = require('ws');

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Binance WebSocket Server is running 🐙</h1>');
});

// WebSocket server (upgrade path only)
const wss = new WebSocket.Server({ noServer: true });

// Per-client Binance WebSocket (stored per connection)
const binanceWs = new Map(); // Track Binance connections per client

// Function to connect to Binance WebSocket based on pairs
function connectToBinance(ws, pairs) {
    if (binanceWs.has(ws)) {
        console.log('🔌 Client already connected to Binance WebSocket');
        return;
    }

    // Construct the WebSocket URL for Binance
    const streamUrl = "wss://stream.binance.com:9443/ws/btcusdt@trade";
    const binanceSocket = new WebSocket(streamUrl);

    binanceSocket.on('open', () => {
        console.log(`🔌 Connected to Binance WebSocket for pairs: ${pairs.join(', ')}`);
    });

    binanceSocket.on('message', (msg) => {
        try {
            const parsed = JSON.parse(msg.toString());

            // Send the Binance message to the user
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ message: 'binance', data: parsed }));
            }
        } catch (err) {
            console.error('❌ Failed to parse Binance message:', err.message);
        }
    });

    binanceSocket.on('error', (err) => {
        console.error('🚨 Binance WebSocket error:', err.message);
    });

    binanceSocket.on('close', () => {
        console.log('🔌 Binance WebSocket closed');
    });

    // Save the WebSocket to the map
    binanceWs.set(ws, binanceSocket);
}

// Store per-client subscriptions for Binance
const clientSubscriptions = new Map();

wss.on('connection', (ws) => {
    console.log('🔌 Client connected');

    // Initialize the client's subscription list
    clientSubscriptions.set(ws, []);

    ws.on('message', (message) => {
        console.log('📩 Message from client:', message);

        try {
            const data = JSON.parse(message);

            // Handle Binance subscription request
            if (data.exchange === 'binance' && Array.isArray(data.pair)) {
                // Ensure pairs are formatted correctly (e.g., ["btcusdt@trade", "ethusdt@trade"])
                const pairs = data.pair.map(pair => pair.trim().toLowerCase());

                // Connect to Binance WebSocket for the requested pairs
                connectToBinance(ws, pairs);
            } else {
                ws.send(JSON.stringify({ message: 'Invalid request format' }));
            }
        } catch (error) {
            ws.send(JSON.stringify({ message: 'Invalid JSON format' }));
        }
    });

    ws.on('close', () => {
        console.log('❌ Client disconnected');
        // Remove the client's subscription list and WebSocket connection
        clientSubscriptions.delete(ws);
        if (binanceWs.has(ws)) {
            binanceWs.get(ws).close(); // Close the Binance connection if it exists
            binanceWs.delete(ws);
        }
    });
});

// Handle upgrade for /market-stream path
server.on('upgrade', (req, socket, head) => {
    if (req.url === '/market-stream') {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    } else {
        const errorMessage = 'WebSocket path invalid. Use ws://localhost:9800/market-stream';
        const response = [
            'HTTP/1.1 404 Not Found',
            'Content-Type: text/plain',
            `Content-Length: ${Buffer.byteLength(errorMessage)}`,
            'Connection: close',
            '',
            errorMessage
        ].join('\r\n');

        socket.write(response);
        socket.destroy();
        console.warn(`❌ Rejected WebSocket connection on invalid path: ${req.url}`);
    }
});

// Ensure WebSocket connections are closed on shutdown
process.on('SIGINT', () => {
    console.log("Shutting down server...");

    binanceWs.forEach((ws) => {
        ws.close(); // Close all open Binance connections
    });

    server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
    });
});

// Start server
const PORT = 9800;
server.listen(PORT, () => {
    console.log(`🚀 Binance WebSocket server running at ws://localhost:${PORT}/market-stream`);
});
