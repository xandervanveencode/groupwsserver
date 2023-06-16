// Setup of all requirements
const mysql = require('mysql');
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const port = process.env.PORT || 3000;
const employeeToken = "EpXZ3Z";

// Setup of database connection
const db_config = {
  host      : 'xandervanveen.nl',
  user      : 'u72001p68553_thinkofu',
  password  : 'wuAYTLujYDq5v7KsTgLn',
  database  : 'u72001p68553_thinkofu'
};

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
  
  // attempt to login
  socket.on("login", (user, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // Check if the user exists in the database
    connection.query(`SELECT users.id, users.username, users.role_id
    FROM users
    WHERE users.username = '${user.username}' AND users.password = '${user.password}'
    `, (err, result) => {
      try { 
        if (result.length == 0) {
          // If there was no user found, return 0
          cb('0');
        } else {
          // If there was a user found, return the user
          cb(result[0]);
        }
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb('0');
      }
    });
    connection.end();
  });

  // Check if user with username exists
  socket.on("check_username", (data, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // Check if the user exists in the database
    connection.query(`SELECT users.id FROM users WHERE users.username = '${data.username}'`, (err, result) => {
      try {
        if (result.length == 0) {
          // If there was no user found, return 0
          cb('0');
        } else {
          // If there was a user found, return 1 for success
          console.log(result);
          cb('1');
        }
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb('0');
      }
    });
    connection.end();
  });

  // Updating the update of alert played
  socket.on("update_log", async (data, cb) => {
    try {
      updateLog(data.alertID, data.played);
      cb(`1`);
    } catch (err) {
      console.log(err);
      cb(`0`);
    }
  });

  // Update the alert played (Arduino)
  socket.on("update_log_arduino", async (data) => {
    console.log(`Arduino with ID: ${socket.id} requests to update alert with ID: ${data.alertID}`);
    try {
      updateLog(data.alertID, 1);
      // Emit success to the arduino
      socket.emit("update_log_success", {success: 1});
    } catch (err) {
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
  socket.on("join_room_employee", async (data, cb) => {
    try {
      socket.join(employeeToken);
      console.log(`Employee with ID: ${socket.id} joined room: ${employeeToken}`);
      // 1 == success
      cb(`1`);
    } catch (err) {
      console.log(err);
      // 0 == error
      cb(`0`);
    } 
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
    } else {
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
    } else {
      console.log(`Arduino with ID: ${socket.id} tried to join room: ${data.sharetoken}`);
      // 0 == error
      // Emit error to the arduino
      socket.emit("join_room_success", {success: 0});
    }
  });
  
  // Get the most recent alert for a lamp
  socket.on("get_recent_alert_for_lamp", (data, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // Get lamp by ID from database
    connection.query(`SELECT MAX(date) AS most_recent_date
    FROM history
    WHERE lamp_id = ${data.id}`, (err, result) => {
      try {
        if (result.length == 0) {
          cb(`0`);
        }
        cb(result[0]);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
  });

  // Get lamp and patient by id
  socket.on("get_lamp", (data, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // Get lamp by ID from database
    connection.query(`SELECT lamp.id AS lamp_id, lamp.name, lamp.sharetoken, users.id AS patient_id, users.username, users.password
      FROM lamp
      INNER JOIN users 
      ON lamp.patient_id = users.id
      WHERE lamp.id = ${data.id}`, (err, result) => {
      try { 
        console.log(result);
        if (result.length == 0) {
          cb(`0`);
        }
        cb(result[0]);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
  });

  // get all lamps from database (dashboard)
  socket.on("get_lamps_dashboard", (cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // get lamps from database
    connection.query(`SELECT l.id AS lamp_id, h.id AS history_id, h.date, l.sharetoken
    FROM lamp l
    LEFT JOIN (
        SELECT h.lamp_id, h.id, h.date
        FROM history h
        INNER JOIN (
            SELECT lamp_id, MAX(date) AS max_date
            FROM history
            GROUP BY lamp_id
        ) sub ON h.lamp_id = sub.lamp_id AND h.date = sub.max_date
    ) h ON l.id = h.lamp_id
    ORDER BY h.date ASC;
`, (err, result) => {
      try { 
        console.log(result)
          cb(result)
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb('0')
      }
    });
    connection.end();
  });

  // Get sharetoken by user id
  socket.on("get_sharetoken_by_user_id", (data, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // Get sharetoken by user id from database
    connection.query(`SELECT lamp.sharetoken
      FROM users
      INNER JOIN lamp
      ON users.id = lamp.patient_id
      WHERE users.id = ${data.id}`, (err, result) => {
      try { 
        console.log(result);
        if (result.length == 0) {
          cb(`0`);
        }
        cb(result[0]["sharetoken"]);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
  });

  // Get all history data from lamp connected by user id
  socket.on("get_all_history_by_user_id", (data, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    connection.query(`SELECT history.color_id, history.message, history.date
      FROM users
      INNER JOIN lamp
      ON users.id = lamp.patient_id
      INNER JOIN history
      ON lamp.id = history.lamp_id
      WHERE users.id = ${data.id}`, (err, result) => {
      try {
        if (result.length == 0) {
          cb(`0`);
        }
        cb(result);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
  });

  // Get all lamps
  socket.on("get_lamps", (cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // get lamps from database
    connection.query(`SELECT * FROM lamp`, (err, result) => {
      try { 
        console.log(result);
        cb(result);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb('0');
      }
    });
    connection.end();
  });

  // Edit lamp name
  socket.on("edit_lamp_name", (data, cb) =>{
    let connection = mysql.createConnection(db_config);
    connection.connect();
    // Update lamp name in database
    connection.query(`UPDATE lamp SET name = '${data.name}' WHERE id = ${data.id}`, (err, result) => {
      try {
        // If there was no error, return 1
        cb(`1`);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
  });

  // Reset lamp
  socket.on("reset_lamp", async (data, cb) =>{
    // Generate new token for lamp, make sure it doesn't exist yet
    let sharetoken = await generateToken();
    // Also update the name of the lamp to be the same as the token (default)
    // Update token in database
    let connection = mysql.createConnection(db_config);
    connection.connect();
    connection.query(`UPDATE lamp SET sharetoken = '${sharetoken}', name = '${sharetoken}' WHERE id = ${data.id}`, (err, result) => {
      try { 
        // If there was no error, do nothing yet
        // The last query will handle the callback
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
    // Generate new login information for patient connected to lamp
    let username = await generateUsername();
    let password = await generatePassword();
    // Update login information in database
    connection = mysql.createConnection(db_config);
    connection.connect();
    connection.query(`UPDATE users SET username = '${username}', password = '${password}' WHERE id = ${data.patient_id}`, (err, result) => {
      try { 
        // If there was no error, do nothing yet
        // The last query will handle the callback
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
    // Remove all history related to the lamp
    connection = mysql.createConnection(db_config);
    connection.connect();
    connection.query(`DELETE FROM history WHERE lamp_id = ${data.id}`, (err, result) => {
      try { 
        // If there was no error, return 1
        cb(`1`);
      } catch (err) {
        console.log(err);
        // If there was an error, return 0
        cb(`0`);
      }
    });
    connection.end();
  });


  // Checking if a lamp exists in the database with the given token
  socket.on("check_token", async (data, cb) => {
    // Check if lamp exists in database
    let exists = await getLampID(data.sharetoken);
    console.log(`User with ID: ${socket.id} requests to check existence of lamp with token: ${data.sharetoken}`);
    if (exists != false) {
      // 1 == lamp exists
      cb(`1`);
    } else {
      // 0 == lamp does not exist
      cb(`0`);
    }
  });

  // Sending alert to lamp
  socket.on("send_alert", async (data, cb) => {
    // Check if color was sent otherwise set to default
    if (data.color == undefined || data.color == '') {
      console.log(`No color was sent, setting to default (9)`);
      // Default color is white (id = 9 in db)
      data.color = 9;
    }
    // Check if text was sent otherwise set to default
    if (data.text == undefined || data.text == '') {
      console.log(`No text was sent, setting to default (empty)`);
      // Default text is empty
      data.text = '';
    }

    // See if the lamp exists in the database
    let lampID = await getLampID(data.room);
    // If the lamp does not exist, send back an error
    if (lampID == false) {
      console.log(`User with ID: ${socket.id} tried to send alert to room: ${data.room}`);
      // 0 == lamp does not exist
      cb(`0`);
      return;
    }
    // Save the alert to the database and get the alertID
    let alertID = await saveAlert(lampID, data.color, data.text);
    // If the alert could not be saved, send back an error
    if (!alertID) {
      console.log(`User with ID: ${socket.id} tried to send alert to room: ${data.room}`);
      // 1 == couldn't save to database
      cb(`1`);
      return;
    }
    // Get the RGB array from the color ID
    let rgbArray = await getColorRGBFromID(data.color);
    // Send alert to all users in the room
    io.to(data.room).emit("receive_alert", {
      alertID: alertID,
      r: rgbArray[0],
      g: rgbArray[1],
      b: rgbArray[2]
    });
    console.log(`User with ID: ${socket.id} sent alert to room: ${data.room}`);
    // 2 == success
    cb(`2`);
  });
});

// Generate a random token that doesn't exist yet
async function generateToken() {
  let sharetoken = await generateRandomString(6);
  let exists = await getLampID(sharetoken);
  // If the token already exists, generate a new one
  while (exists) {
    sharetoken = generateRandomString(6);
    exists = await getLampID(sharetoken);
  }
  return sharetoken;
}

// Generate a random username that doesn't exist yet
async function generateUsername() {
  let username = await generateRandomString(6);
  let exists = await getUserID(username);
  // If the username already exists, generate a new one
  while (exists) {
    username = generateRandomString(6);
    exists = await getUserID(username);
  }
  return username;
}

// Generate a random password
async function generatePassword() {
  let password = await generateRandomString(6);
  return password;
}

async function generateRandomString(length) {
  let result = '';
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Get userID by username
async function getUserID(username) {
  let connection = mysql.createConnection(db_config);
  connection.connect();
  let sql = "SELECT `id` FROM `users` WHERE users.username = '" + username + "'";
  console.log(sql);
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, result) => {
      if (err) {
        reject(err);
      } else {
        connection.end();
        if (result.length == 0) {
          resolve(false);
        } else {
          resolve(result[0].id);
        }
      }
    });
  });
}

// Get token for lamp room
async function getLampToken(lampID) {
  let connection = mysql.createConnection(db_config);
  connection.connect();
  let sql = "SELECT `sharetoken` FROM `lamp` WHERE lamp.id = '" + lampID + "'";
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, result) => {
      connection.end();
      if (err) {
        reject(err);
      } else {
        resolve(result[0].sharetoken);
      }
    });
  });
}

// Update the alert that it's been shown
async function updateLog(alertID, played) {
  let connection = mysql.createConnection(db_config);
  connection.connect();
  let sql = "UPDATE `history` SET `played` = '" + played + "' WHERE history.id = '" + alertID + "'";
  console.log(sql);
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, result) => {
      connection.end();
    });
  });
}

// Get the id of the lamp with the given token
async function getLampID(sharetoken) {
  let connection = mysql.createConnection(db_config);
  connection.connect();
  let sql = "SELECT `id` FROM `lamp` WHERE lamp.sharetoken = '" + sharetoken + "' COLLATE utf8_bin";
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, result) => {
      connection.end();
      if (err) {
        reject(err);
      }
      // If the result is not empty, send back the id of the lamp
      if (result.length > 0) {
        resolve(result[0].id);
      } else {
        resolve(false);
      }
    });
  });
}

// Get the id of the lamp with the given token
async function getColorRGBFromID(colorID) {
  let connection = mysql.createConnection(db_config);
  connection.connect();
  let sql = "SELECT `r`, `g`, `b` FROM `color` WHERE color.id = " + colorID + ";";
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, result) => {
      connection.end();
      if (err) {
        reject(err);
      }
      // If the result is not empty, send back the id of the lamp
      if (result.length > 0) {
        resolve([result[0].r, result[0].g, result[0].b]);
      } else {
        resolve(false);
      }
    });
  });
}

// Save alert to database
async function saveAlert(lampID, colorID, message) {
  let connection = mysql.createConnection(db_config);
  connection.connect();
  let sql = "INSERT INTO `history` (`lamp_id`, `color_id`, `message`, `played`) VALUES (" + lampID + ", " + colorID + ", '" + message + "', false);";
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, result) => {
      if (err) {
        connection.end();
        reject(err);
      }
      // If no row has been created, send back false
      if (result.affectedRows == 0) {
        connection.end();
        resolve(false);
      }
    });
    // Get the id of the alert that was just created
    connection.query("SELECT LAST_INSERT_ID() as `id`;", (err, result) => {
      connection.end();
      if (err) {
        reject(err);
      }
      // If the result is not empty, send back the id of the alert
      if (result.length > 0) {
        resolve(result[0].id);
      } else {
        resolve(false);
      }
    });
  });
}

// Start the server
server.listen(port, () => {
  console.log(`listening on *${port}`);
});