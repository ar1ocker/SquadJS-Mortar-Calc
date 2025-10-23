import BasePlugin from "./base-plugin.js";
import MortarCalc from "./mortarCalcLib.js";
import express from "express";
import Sequelize from "sequelize";

const { DataTypes } = Sequelize;

export default class MortarCalcServicePlugin extends BasePlugin {
  static get description() {
    return "Mortar calc service";
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      reset_code_commands: {
        required: false,
        description: "Command to reset code",
        default: ["resetcode", "сброситькод"],
      },
      path: {
        required: true,
      },
      port: {
        required: true,
      },
      database: {
        required: true,
        connector: "sequelize",
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.playerDB = this.options.database.define(
      "MortarCalc_Player",
      {
        steamID: { type: DataTypes.STRING, allowNull: false, unique: true },
        code: { type: DataTypes.STRING, allowNull: false, unique: true },
      },
      {
        tableName: "MortarCalc_Players",
      }
    );

    this.app = express();
    this.app.use(express.json());

    this.mortarCalc = new MortarCalc();

    this.app.post(this.options.path + "/:code", async (req, res) => {
      const code = parseInt(req.params.code);

      if (!code) {
        res.status(404).end();
        return;
      }

      const player = await this.playerDB.findOne({
        where: {
          code: code.toString(),
        },
      });

      if (!player) {
        res.status(404).end();
        return;
      }

      const origin = req.body.origin;
      const target = req.body.target;

      if (!origin || !target) {
        res.status(400).send("Не хватает параметров origin или target");
        return;
      }

      if (!this.mortarCalc.validateGrid(origin) || !this.mortarCalc.validateGrid(target)) {
        res.status(400).send(`Не валидные параметры ${origin} или ${target}`);
        return;
      }

      res.status(201).end();

      const solution = this.mortarCalc.calculateSolution(origin, target);
      await this.warn(player.steamID, this.getSolutionText(solution, origin, target));
    });
  }

  async prepareToMount() {
    await this.playerDB.sync();
  }

  async mount() {
    for (const command of this.options.reset_code_commands) {
      this.server.on(`CHAT_COMMAND:${command}`, (data) => {
        if (data.player?.steamID) {
          this.resetCode(data.player);
        }
      });
    }

    this.app.listen(this.options.port, () => {
      console.log(`Mortar calc service run on port ${this.options.port}`);
    });
  }

  async resetCode(player) {
    let code;
    while (true) {
      code = this.getRandomCode();
      try {
        await this.playerDB.upsert({
          steamID: player.steamID,
          code: code,
        });
        break;
      } catch (err) {
        if (err.name === "SequelizeUniqueConstraintError") {
          console.log(err);
          continue;
        } else {
          throw err;
        }
      }
    }

    await this.warn(player.steamID, `Ваш новый код ${code}`);
  }

  getRandomCode() {
    return (Math.random() * 899999 + 100000).toFixed(0);
  }

  getSolutionText(solution, origin, target) {
    let milsStr;
    if (solution.tooClose) {
      milsStr = "слишком близко";
    } else if (solution.tooFar) {
      milsStr = "слишком далеко";
    } else {
      milsStr = `${solution.mils} мрад`;
    }

    return `Дальность: ${solution.range} метров\nУгол: ${solution.angle}° | Возвышение: ${milsStr}\n${origin.toUpperCase()} -> ${target.toUpperCase()}`;
  }

  async warn(playerID, message, repeat = 1, frequency = 5) {
    for (let i = 0; i < repeat; i++) {
      // repeat используется для того, чтобы squad выводил все сообщения, а не скрывал их из-за того, что они одинаковые
      await this.server.rcon.warn(playerID, message + "\u{00A0}".repeat(i));

      if (i !== repeat - 1) {
        await new Promise((resolve) => setTimeout(resolve, frequency * 1000));
      }
    }
  }

  async warns(playerID, messages, frequency = 5) {
    for (const [index, message] of messages.entries()) {
      await this.server.rcon.warn(playerID, message);

      if (index != messages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, frequency * 1000));
      }
    }
  }
}
