const fs = require('fs');
const http = require('http');

const WebSocket = require('ws');
const uuid = require('uuid');

// Twilio bits, following https://www.twilio.com/docs/stun-turn
// and taking the account details from the environment as
// security BCP.
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
let twilio;
if (twilioAccountSid && twilioAuthToken) {
    twilio = require('twilio')(twilioAccountSid, twilioAuthToken);
}

const port = 8080;
 
// We use a HTTP server for serving static pages. In the real world you'll
// want to separate the signaling server and how you serve the HTML/JS, the
// latter typically through a CDN.
const server = http.Server({})
    .listen(port);
server.on('listening', () => {
    console.log('Server listening on http://localhost:' + port);
});
server.on('request', (request, response) => {
    const urlToPath = {
        '/': 'static/index.html',
        '/no-autodial': 'static/no-autodial.html',
        '/main.js': 'static/main.js',
        '/main.css': 'static/main.css',
    };
    const urlToContentType = {
        '/': 'text/html',
        '/no-autodial': 'text/html',
        '/main.js': 'application/javascript',
        '/main.css': 'text/css',
    };
    const filename = urlToPath[request.url];
    if (!filename) {
        response.writeHead(404);
        response.end();
        return;
    }
    fs.readFile(filename, (err, data) => {
        if (err) {
            console.log('could not read client file', err);
            response.writeHead(404);
            response.end();
            return;
        }
        response.writeHead(200, {'Content-Type': urlToContentType[request.url]});
        response.end(data);
    });
});

// A map of websocket connections.
const connections = new Map();
// WebSocket server, running alongside the http server.
const wss = new WebSocket.Server({server});

// Generate a (unique) client id.
// Exercise: extend this to generate a human-readable id.
function generateClientId() {
    // TODO: enforce uniqueness here instead of below.
    return uuid.v4();
}
 
wss.on('connection', (ws) => {
    // Assign an id to the client. The other alternative is to have the client
    // pick its id and tell us. But that needs handle duplicates. It is preferable
    // if you have ids from another source but requires some kind of authentication.
    const id = generateClientId();
    console.log(id, 'Received new connection');

    if (connections.has(id)) {
        console.log(id, 'Duplicate id detected, closing');
        ws.close();
        return;
    }
    // Store the connection in our map of connections.
    connections.set(id, ws);

    // Send a greeting to tell the client its id.
    ws.send(JSON.stringify({
        type: 'hello',
        id,
    }));

    // Send an ice server configuration to the client. For stun this is synchronous,
    // for TURN it might require getting credentials.
    if (twilio) {
        twilio.tokens.create().then(token => {
            ws.send(JSON.stringify({
                type: 'iceServers',
                iceServers: token.iceServers,
            }));
        });
    } else {
        ws.send(JSON.stringify({
            type: 'iceServers',
            iceServers: [{urls: 'stun:stun.l.google.com:19302'}],
        }));
    }

    // Remove the connection and notify anyone we are in a call with that
    // our socket went away.
    const notifyOnClose = []; // clients to be notified when this socket closes.
    ws.on('close', () => {
        console.log(id, 'Connection closed');
        connections.delete(id); 
        notifyOnClose.forEach(remoteId => {
            const peer = connections.get(remoteId);
            if (!peer) {
                return;
            }
            peer.sendMessage({
                type: 'bye',
                id,
            });
        });
    });

    ws.on('message', (message) => {
        console.log(id, 'received', message);
        let data;
        // TODO: your protocol should send some kind of error back to the caller instead of
        // returning silently below.
        try  {
            data = JSON.parse(message);
        } catch (err) {
            console.log(id, 'invalid json', err, message);
            return;
        }
        if (!data.id) {
            console.log(id, 'missing id', data);
            return;
        }

        // The direct lookup of the other clients websocket is overly simplified.
        // In the real world you might be running in a cluster and would need to send
        // messages between different servers in the cluster to reach the other side.
        if (!connections.has(data.id)) {
            console.log(id, 'peer not found', data.id);
            // TODO: the protocol needs some error handling here. This can be as
            // simple as sending a 'bye' with an extra error element saying 'not-found'.
            return;
        }
        const peerId = data.id;
        const peer = connections.get(peerId);

        // Stamp messages with our id. In the client-to-server direction, 'id' is the
        // client that the message is sent to. In the server-to-client direction, it is
        // the client that the message originates from.
        data.id = id;
        peer.sendMessage(data);

        // Keep some state about established calls.
        ws.trackCallState(data, peerId);
    });

    // Send a message from a peer to our websocket.
    ws.sendMessage = (data) => {
        ws.trackCallState(data, data.id);

        ws.send(JSON.stringify(data), (err) => {
            if (err) {
                console.log(id, 'failed to send to socket', err);
            }
        });
    };
    
    ws.trackCallState = (data, peerId) => {
        switch(data.type) {
        case 'answer':
            notifyOnClose.push(peerId);
            break;
        case 'bye':
            if (notifyOnClose.indexOf(peerId) !== -1) {
                notifyOnClose.splice(notifyOnClose.indexOf(peerId), 1);
            }
            break;
        }
    };
});
