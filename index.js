// Setup of all requirements
const mysql = require('mysql');
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const port = 80;

// Setup of database connection
const db = mysql.createConnection({
    host      : 'xandervanveen.nl',
    user      : 'u72001p68553_thinkofu',
    password  : 'wuAYTLujYDq5v7KsTgLn',
    database  : 'u72001p68553_thinkofu'
  });
  
  // Connect to the database
  db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
  });
  
  // Setup of cors
  app.use(cors());
  
  // Create the server
  const server = http.createServer(app);
  
  // Configure socket.io
  const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins
        transports: ["websocket", "polling"] // Transports is not necessary
    },
    allowEIO3: true // Basically allows the arduino to connect
  });
  
  // When a user connects, handle all further events
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
  
    // Disconnecting a user from the server
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  
    // =========================================== Updating the update of alert played
    socket.on("update_log", async (data, cb) => {
      try{
        updateLog(data.alertID, data.played);
        cb(`1`)
      }
      catch(err) {
        console.log(err);
        cb(`0`)
      }
    });
    // =========================================== Update the alert played (Arduino)
    socket.on("update_log_arduino", async (data) => {
      console.log(`Arduino with ID: ${socket.id} requests to update alert with ID: ${data.alertID}`);
      try{
        updateLog(data.alertID, 1);
        // Emit success to the arduino
        socket.emit("update_log_success", {success: 1});
      }
      catch(err) {
        console.log(err);
        // Emit error to the arduino
        socket.emit("update_log_success", {success: 0});
      }
    });
  
    // Get token for lamp
    socket.on("get_token", async (data, cb) => {
      console.log(`User with ID: ${socket.id} requests token for lamp with ID: ${data.lampID}`)
      let sharetoken = await getLampToken(data.lampID);
      
      console.log(`Token: ${sharetoken}`);
      cb(sharetoken)
    });
  
    // Get token for lamp (Arduino)
    socket.on("get_token_arduino", async (data) => {
      console.log(`Arduino with ID: ${socket.id} requests token for lamp with ID: ${data.lampID}`)
      let sharetoken = await getLampToken(data.lampID);
  
      // Emit the token to the arduino
      socket.emit("receive_token", {sharetoken: sharetoken});
    });
  
    // Adding user to a room
    socket.on("join_room", async (data, cb) => {
      // Check if lamp exists in database before joining room
      let exists = await getLampID(data.sharetoken);
      if (exists != false) {
        socket.join(data.sharetoken);
        console.log(`User with ID: ${socket.id} joined room: ${data.sharetoken}`);
        // 1 == success
        cb(`1`);
      }
      else {
        console.log(`User with ID: ${socket.id} tried to join room: ${data.sharetoken}`);
        // 0 == error
        cb(`0`);
      }
    });
  
    // Adding user to a room (Arduino)
    socket.on("join_room_arduino", async (data) => {
      // Check if lamp exists in database before joining room
      let exists = await getLampID(data.sharetoken);
      if (exists != false) {
        socket.join(data.sharetoken);
        console.log(`Arduino with ID: ${socket.id} joined room: ${data.sharetoken}`);
        // 1 == success
        // Emit success to the arduino
        socket.emit("join_room_success", {success: 1});
      }
      else {
        console.log(`Arduino with ID: ${socket.id} tried to join room: ${data.sharetoken}`);
        // 0 == error
        // Emit error to the arduino
        socket.emit("join_room_success", {success: 0});
      }
    });
  
    // Checking if a lamp exists in the database with the given token
    socket.on("check_token", async (data, cb) => {
      // Check if lamp exists in database
      let exists = await getLampID(data.sharetoken);
      console.log(`User with ID: ${socket.id} requests to check existence of lamp with token: ${data.sharetoken}`);
      if (exists != false) {
        // 1 == lamp exists
        cb(`1`);
      }
      else {
        // 0 == lamp does not exist
        cb(`0`);
      }
    });
  
    // Sending alert to lamp
    socket.on("send_alert", async (data, cb) => {
      // Get the lampID from the database
      let lampID = await getLampID(data.room);
      // If the lamp does not exist, send back an error
      if (lampID == false) {
        console.log(`User with ID: ${socket.id} tried to send alert to room: ${data.room}`);
        // TODO: Should return a error that tells the client the lamp does not exist
        cb(`0`);
        return;
      }
      // Save the alert to the database and get the alertID
      let alertID = await saveAlert(lampID);
      // If the alert could not be saved, send back an error
      if (!alertID) {
        console.log(`User with ID: ${socket.id} tried to send alert to room: ${data.room}`);
        cb(`0`);
        return;
      }
      // Send alert to all users in the room
      io.to(data.room).emit("receive_alert", {alertID: alertID});
      console.log(`User with ID: ${socket.id} sent alert to room: ${data.room}`);
      cb(`1`);
    });
  });
  
  
  // Get token for lamp room
  async function getLampToken(lampID) {
    let sql = "SELECT `sharetoken` FROM `lamp` WHERE lamp.id = '" + lampID + "'";
    return new Promise((resolve, reject) => {
      db.query(sql, (err, result) => {
        if (err) {
          reject(err);
        }
        else{
          resolve(result[0].sharetoken);
        }
      });
    });
  }
  
  // Update the alert that it's been shown
  async function updateLog(alertID, played) {
    let sql = "UPDATE `history` SET `played` = '" + played + "' WHERE history.id = '" + alertID + "'";
    console.log(sql);
    return new Promise((resolve, reject) => {
      db.query(sql, (err, result) => {
      });
    });
  }
  
  
  // Check if lamp exists in database
  async function getLampID(sharetoken) {
    let sql = "SELECT `id` FROM `lamp` WHERE lamp.sharetoken = '" + sharetoken + "'";
    return new Promise((resolve, reject) => {
      db.query(sql, (err, result) => {
        if (err) {
          reject(err);
        }
        // If the result is not empty, send back the id of the lamp
        if (result.length > 0) {
          resolve(result[0].id);
        }
        else {
          resolve(false);
        }
      });
    });
  }
  
  // Save alert to database
  async function saveAlert(lampID) {
    let sql = "INSERT INTO `history` (`lamp_id`, `played`) VALUES (" + lampID + ", false);";
    return new Promise((resolve, reject) => {
      db.query(sql, (err, result) => {
        if (err) {
          reject(err);
        }
        // If no row has been created, send back false
        if (result.affectedRows == 0) {
          resolve(false);
        }
      });
      db.query("SELECT LAST_INSERT_ID() as `id`;", (err, result) => {
        if (err) {
          reject(err);
        }
        // If the result is not empty, send back the id of the alert
        if (result.length > 0) {
          resolve(result[0].id);
        }
        else {
          resolve(false);
        }
        
      });
    });
  }
  
  // Start the server
  server.listen(port, () => {
    console.log(`listening on *${port}`);
  });