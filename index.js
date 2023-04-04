const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const url = require("url");
const users_model = require("./models/users");
const games_model = require("./models/games");
const submissions_model = require("./models/submissions");
dotenv.config();
const app = express();
const port = process.env.PORT;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(cookieParser());

mongoose.connect(
  //hidden
);

/*
Coding System:
0: Success
1: Error
2: Unknown Error
3: Not authenticated
*/

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

//REGISTER:
app.post("/auth/register", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const confirmPassword = req.body.confirmPassword;
  if (password !== confirmPassword) {
    return res.status(200).json({
      data: {},
      msg: "Passwords do not match.",
      code: 1,
    });
  }
  if (username.length < 5) {
    return res.status(200).json({
      data: {},
      msg: "Username must be at least 5 characters long.",
      code: 1,
    });
  }
  if (password.length < 10) {
    return res.status(200).json({
      data: {},
      msg: "Password must be at least 10 characters long.",
      code: 1,
    });
  }
  const sameUser = await users_model.findOne({ username: username });
  if (sameUser) {
    return res.status(200).json({
      data: {},
      msg: "Username is taken.",
      code: 1,
    });
  }
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const newUser = new users_model({
    username: username,
    password: hashedPassword,
    salt: salt,
    isAdmin: false,
  });
  newUser.save();
  return res.status(200).json({
    data: {},
    msg: "Success",
    code: 0,
  });
});

//LOGIN:
app.post("/auth/login", async (req, res) => {
  const username = req.body.username;
  const attemptingPassword = req.body.password;

  const User = await users_model.findOne({ username: username });
  if (!User) {
    return res.status(200).json({
      data: {},
      msg: "There is no such user.",
      code: 1,
    });
  }

  if ((await bcrypt.hash(attemptingPassword, User.salt)) !== User.password) {
    return res.status(200).json({
      data: {},
      msg: "Invalid password.",
      code: 1,
    });
  }
  const code_token = jwt.sign({ _id: User._id }, process.env.SECRET);
  res.cookie("code", code_token, {
    httpOnly: true,
    max: 24 * 60 * 60 * 1000,
  });
  return res.status(200).json({
    data: {},
    msg: "Success",
    code: 0,
  });
});

//LOGOUT:
app.get("/auth/logout", async (req, res) => {
  res.cookie("code", "", { maxAge: 0 });
  res.status(200).send({ data: {}, msg: "Success", code: 0 });
});

//VERIFICATION:
app.get("/auth/sessions/verify", async (req, res) => {
  try {
    const cookie = req.cookies["code"];
    const claims = jwt.verify(cookie, process.env.SECRET);

    if (!claims) {
      return res.status(200).send({
        data: {},
        msg: "User is not logged in",
        code: 1,
      });
    }

    const User = await users_model.findOne({ _id: claims._id });

    if (!User) {
      return res.status(200).send({
        data: {},
        msg: "No account found",
        code: 1,
      });
    }
    return res.status(200).send({
      data: { User },
      msg: "Success",
      code: 0,
    });
  } catch (err) {
    return res.status(500).send({
      data: {},
      msg: "Unknown error",
      code: 2,
    });
  }
});

//ADD GAME:
app.post("/addGame", async (req, res) => {
  if (!req.body.isAdmin) {
    return res.status(200).send({
      data: {},
      msg: ["Error", "Not authenticated"],
      code: 3,
    });
  }

  const Game = await games_model.findOne({ name: req.body.name.toUpperCase() });
  if (Game) {
    return res.status(200).send({
      data: {},
      msg: ["Error", "Game already exists"],
      code: 1,
    });
  }
  const newGame = new games_model({
    name: req.body.name.toUpperCase(),
  });
  newGame.save();
  return res.status(200).send({
    data: {},
    msg: ["Success", "Game added successfully"],
    code: 0,
  });
});

//LOAD GAMES:
app.get("/loadGames", async (req, res) => {
  const games = await games_model.find({});
  return res.status(200).send({
    data: { games },
    msg: "Success",
    code: 0,
  });
});

//SUBMIT SPEEDRUN:
app.post("/submitSpeedrun", async (req, res) => {
  const cookie = req.cookies["code"];
  const claims = jwt.verify(cookie, process.env.SECRET);
  const User = await users_model.findOne({ _id: claims._id });
  if (!claims || !User) {
    return res.status(200).send({
      data: {},
      msg: ["Error", "Not authenticated"],
      code: 3,
    });
  }
  const name = req.body.name;
  const game = req.body.game;
  const url = req.body.url;
  const checked = req.body.checked ? "Yes" : "No";
  const username = req.body.username;
  const userSortedSpeedruns = sortTime(
    await submissions_model.find({ author: username }), //user submissions (1st param)
    "newer" //factor of sorting (2nd param)
  );
  const user = await users_model.findOne({ username: username });

  if (!user.isAdmin && userSortedSpeedruns[0]) {
    if (
      userSortedSpeedruns[0].date === new Date().toLocaleDateString("en-US")
    ) {
      return res.status(200).send({
        data: {},
        msg: [
          "Error!",
          "You already have uploaded a submission today. Wait for tomorrow to apply for a new one.",
        ],
        code: 1,
      });
    }
  }
  if (name.length < 10) {
    return res.status(200).send({
      data: {},
      msg: [
        "Error!",
        "Speedrun name must be at least 10 characters long. Try putting a new one.",
      ],
      code: 1,
    });
  }
  if (name.length > 50) {
    return res.status(200).send({
      data: {},
      msg: [
        "Error!",
        "Speedrun name must be maximum 30 characters long. Try putting a new one.",
      ],
      code: 1,
    });
  }

  const Speedrun_name = await submissions_model.findOne({ name: name });
  if (Speedrun_name) {
    return res.status(200).send({
      data: {},
      msg: ["Error!", "Speedrun name already exists. Try putting a new one."],
      code: 1,
    });
  }

  const Speedrun_url = await submissions_model.findOne({ url: url });
  if (Speedrun_url) {
    return res.status(200).send({
      data: {},
      msg: ["Error!", "Speedrun URL already exists."],
      code: 1,
    });
  }

  const validGame = await games_model.findOne({ name: game });
  if (!validGame) {
    //kinda impossible
    return res.status(200).send({
      data: {},
      msg: [
        "Error!",
        "Invalid game. If you want this game to be added then contact an admin.",
      ],
      code: 1,
    });
  }

  if (!isValidUrl(url)) {
    return res.status(200).send({
      data: {},
      msg: [
        "Error!",
        "URL is invalid (needs to start with 'https://' and be valid)",
      ],
      code: 1,
    });
  }
  const newSpeedrun = new submissions_model({
    name: name,
    game: game,
    url: url,
    bugs: checked,
    author: username,
    date: new Date().toLocaleDateString("en-US"),
    status: "awaiting",
  });
  newSpeedrun.save();

  return res.status(200).send({
    data: {},
    msg: [
      "Success!",
      "Your upload is successful and will be public as soon as it gets approved. Visit your submissions panel to check the status of your submission.",
    ],
    code: 0,
  });
});

//LOAD SPEEDRUNS:
app.get("/loadSpeedruns", async (req, res) => {
  try {
    const speedruns = sortTime(
      await submissions_model.find({ status: "approved" }),
      "newer"
    );
    return res.status(200).send({
      data: { speedruns },
      msg: "Success",
      code: 0,
    });
  } catch (err) {
    return res.status(500).send({
      data: {},
      msg: "Unknown error",
      code: 2,
    });
  }
});

//SEARCH:
app.post("/loadSearch", async (req, res) => {
  const speedruns = req.body.speedruns;
  const input = req.body.input;
  const newSpeedruns = speedruns.filter((el) => el.name.includes(input));
  return res.status(200).send({
    data: { newSpeedruns },
    msg: "Success",
    code: 0,
  });
});

//LOAD FILTERS:
app.post("/loadFilters", async (req, res) => {
  try {
    let newSpeedruns;
    const speedruns = req.body.speedruns;
    const type = req.body.type;
    const value = req.body.value;
    if (type === "name") {
      if (value === "(A-Z)") {
        newSpeedruns = speedruns.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        newSpeedruns = speedruns.sort((a, b) => b.name.localeCompare(a.name));
      }
    }
    if (type === "game") {
      newSpeedruns = speedruns.filter((el) => el.game === value.toUpperCase());
    }
    if (type === "bugs") {
      newSpeedruns = speedruns.filter((el) => el.bugs === value);
    }
    if (type === "author") {
      newSpeedruns = speedruns.filter((el) => el.author === value);
    }
    if (type === "date") {
      if (value === "Newer") {
        newSpeedruns = sortTime(speedruns, "newer");
      } else {
        newSpeedruns = sortTime(speedruns, "older");
      }
    }
    return res.status(200).send({
      data: { newSpeedruns },
      msg: "Success",
      code: 0,
    });
  } catch (err) {
    return res.status(500).send({
      data: {},
      msg: "Unknown error",
      code: 2,
    });
  }
});

//LOAD SPEEDRUN PAGE:
app.post("/speedrun", async (req, res) => {
  const id = req.body.url.substring(req.body.url.indexOf("=") + 1);
  let speedrun;
  id.length === 24
    ? (speedrun = await submissions_model.findOne({
        _id: id,
      }))
    : (speedrun = null);

  return res.status(200).send({
    data: { speedrun },
    msg: "Success",
    code: 0,
  });
});

//LOAD MY SUBMISSIONS:
app.post("/mySubmissions", async (req, res) => {
  const speedruns = await submissions_model.find({
    author: req.body.author.username,
  });
  return res.status(200).send({
    data: { speedruns },
    msg: "Success",
    code: 0,
  });
});

//LOAD AWAITING SUBMISSIONS FOR ADMIN SUBMISSIONS PANEL:
app.post("/submissions", async (req, res) => {
  const speedruns = await submissions_model.find({
    status: "awaiting",
  });
  return res.status(200).send({
    data: { speedruns },
    msg: "Success",
    code: 0,
  });
});

//MANAGE SPEEDRUN:
app.post("/manage", async (req, res) => {
  if (!req.body.isAdmin) {
    return res.status(200).send({
      data: {},
      msg: ["Error", "Not authenticated"],
      code: 3,
    });
  }

  const newStatus = req.body.option === "Yes" ? "approved" : "rejected";
  submissions_model.findOneAndUpdate(
    { _id: req.body.id },
    { status: newStatus },
    { upsert: true, new: true },
    (err, docs) => {
      return res.status(200).json({
        data: {},
        msg: "Success",
        code: 0,
      });
    }
  );
});

//DELETE SPEEDRUN:
app.post("/delete", async (req, res) => {
  if (!req.body.isAdmin) {
    return res.status(200).send({
      data: {},
      msg: ["Error", "Not authenticated"],
      code: 3,
    });
  }
  await submissions_model.deleteOne({
    _id: req.body.id,
  });
  return res.status(200).send({
    data: {},
    msg: "Success. Speedrun deleted.",
    code: 0,
  });
});

//FUNCTIONS:

//Check if a URL is valid:
const isValidUrl = (urlString) => {
  var urlPattern = new RegExp(
    "^(https?:\\/\\/)?" + // validate protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // validate domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // validate OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // validate port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // validate query string
      "(\\#[-a-z\\d_]*)?$",
    "i"
  ); // validate fragment locator

  if (urlString.indexOf("https://") !== 0) {
    return false;
  }
  return !!urlPattern.test(urlString);
};

//Sort by time:
function sortTime(speedruns, sorting) {
  let i, j, temp;
  let years = speedruns.map((el) => Number(el.date.split("/")[2]));
  let months = speedruns.map((el) => Number(el.date.split("/")[0]));
  let days = speedruns.map((el) => Number(el.date.split("/")[1]));
  if (sorting === "newer") {
    for (i = 1; i <= speedruns.length; i++) {
      for (j = speedruns.length; j >= i; j--) {
        if (years[j - 1] < years[j]) {
          temp = years[j - 1];
          years[j - 1] = years[j];
          years[j] = temp;
          temp = speedruns[j - 1];
          speedruns[j - 1] = speedruns[j];
          speedruns[j] = temp;
        } else if (years[j - 1] === years[j]) {
          if (months[j - 1] < months[j]) {
            temp = months[j - 1];
            months[j - 1] = months[j];
            months[j] = temp;
            temp = speedruns[j - 1];
            speedruns[j - 1] = speedruns[j];
            speedruns[j] = temp;
          } else if (months[j - 1] === months[j]) {
            if (days[j - 1] < days[j]) {
              temp = days[j - 1];
              days[j - 1] = days[j];
              days[j] = temp;
              temp = speedruns[j - 1];
              speedruns[j - 1] = speedruns[j];
              speedruns[j] = temp;
            }
          }
        }
      }
    }
  } else if (sorting === "older") {
    for (i = 1; i <= speedruns.length; i++) {
      for (j = speedruns.length; j >= i; j--) {
        if (years[j - 1] > years[j]) {
          temp = years[j - 1];
          years[j - 1] = years[j];
          years[j] = temp;
          temp = speedruns[j - 1];
          speedruns[j - 1] = speedruns[j];
          speedruns[j] = temp;
        } else if (years[j - 1] === years[j]) {
          if (months[j - 1] > months[j]) {
            temp = months[j - 1];
            months[j - 1] = months[j];
            months[j] = temp;
            temp = speedruns[j - 1];
            speedruns[j - 1] = speedruns[j];
            speedruns[j] = temp;
          } else if (months[j - 1] === months[j]) {
            if (days[j - 1] > days[j]) {
              temp = days[j - 1];
              days[j - 1] = days[j];
              days[j] = temp;
              temp = speedruns[j - 1];
              speedruns[j - 1] = speedruns[j];
              speedruns[j] = temp;
            }
          }
        }
      }
    }
  }
  return speedruns;
}
