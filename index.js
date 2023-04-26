// Allows use of admin ui on: https://admin.socket.io
const { instrument } = require('@socket.io/admin-ui');

// Setup of all requirements
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const port = process.env.PORT;

// Setup of cors
app.use(cors());

// Create the server
const server = http.createServer(app);

// Configure socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});

// When a user connects, handle all further events
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Disconnecting a user from the server
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });

    // Removing user from a room
    socket.on("leave_room", (data, cb) => {
        socket.leave(data.room);
        console.log(`User with ID: ${socket.id} left room: ${data.room}`);
        cb(`Left ${data.room}`);
    });

    // Adding user to a room
    socket.on("join_room", (data, cb) => {
        socket.join(data.room);
        console.log(`User with ID: ${socket.id} joined room: ${data.room}`);
        cb(`Joined ${data.room}`);
    });

    // Handling the send message event
    socket.on('send_message', (data) => {
        socket.to(data.room).emit('receive_message', data);
        // Add feature that lets the sender know they sent a message
        // cb is not working, search for something else or hope it suddenly does
    });
});

// Start the server
server.listen(port, () => {
    console.log(`listening on ${port}`);
});

// Extra code for admin ui
instrument(io, { auth: false });