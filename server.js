const fs = require('fs');
const http = require('http');

const WebSocket = require('ws');
const uuid = require('uuid');

const port = 8080;
 
const server = http.Server({})
    .listen(port);
server.on('listening', () => {
    console.log('Server listening on http://localhost:' + port);
});
server.on('request', (request, response) => {
    fs.readFile('static/index.html', (err, data) => {
        if (err) {
            console.log('could not read client file', err);
            response.writeHead(404);
            response.end();
            return;
        }
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end(data);
    });
});
const wss = new WebSocket.Server({server});

// A map of websocket connections.
const connections = new Map();
 
wss.on('connection', (ws) => {
    const id = uuid.v4();
    // Assign an id to the client. The other alternative is to have the client
    // pick its id and tell us. But that needs handle duplicates. It is preferable
    // if you have ids from another source but requires some kind of authentication.
    ws.id = id;
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

    ws.on('close', () => {
        // Remove the connection. Note that this does not tell anyone you are currently in a call with
        // that this happened. This would require additional statekeeping that is not done here.
        console.log(id, 'Connection closed');
        connections.delete(id); 
    });

    ws.on('message', (message) => {
        console.log(id, 'received', message);
        let data;
        try  {
            data = JSON.parse(message);
        } catch (err) {
            console.log(id, 'invalid json', err, message);
            return;
        }
        if (!data.id) {
            console.log(id, 'missing id', data);
        }
        if (!connections.has(data.id)) {
            console.log(id, 'peer not found', data.id);
        }
        const peer = connections.get(data.id);

        // stamp messages with our id.
        data.id = id;
        // This is overly simplified.
        peer.send(JSON.stringify(data), (err) => {
            if (err) {
                console.log(id, 'failed to send to peer', err);
            }
        });
    });
});
