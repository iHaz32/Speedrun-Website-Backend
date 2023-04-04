const mongoose = require("mongoose");

const gamesSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("games", gamesSchema);
