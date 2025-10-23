import BasePlugin from "./base-plugin.js";
import MortarCalc from "./mortarCalcLib.js";

export default class MortarCalcPlugin extends BasePlugin {
  static get description() {
    return "Mortar calc";
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      calc_commands: {
        required: false,
        default: ["calc", "c", "с", "к", "калькулятор", "кальк"],
      },
      target_designation_commands: {
        required: false,
        default: ["td", "цу", "целеуказание", "target"],
      },
      set_origin_commands: {
        required: false,
        default: ["sc", "мп", "or", "origin", "coord", "коорд"],
      },
      valid_roles_for_designation: {
        required: false,
        default: [
          {
            readable_name: "сквадной",
            role_regex: ".*SL.*",
          },
          {
            readable_name: "марксман",
            role_regex: ".*Marksman.*",
          },
          { readable_name: "снайпер", role_regex: ".*Sniper.*" },
        ],
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.mortarCalc = new MortarCalc();
    this.lastPlayerOrigin = new Map();
  }

  async mount() {
    for (const command of this.options.calc_commands) {
      this.server.on(`CHAT_COMMAND:${command}`, (data) => {
        if (data.player?.steamID) {
          if (data.message) {
            this.calcMessageProcessing(data);
          } else {
            this.sendCalcHelp(data.player);
          }
        }
      });
    }

    this.server.on("NEW_GAME", () => {
      this.lastPlayerOrigin.clear();
      this.verbose(2, "Очищен список последних локаций пользователей");
    });

    for (const command of this.options.set_origin_commands) {
      this.server.on(`CHAT_COMMAND:${command}`, (data) => {
        if (data.player?.steamID && data.message) {
          this.verbose(2, `${data.player.steamID} запросил изменение координат на ${data.message}`);
          this.setOriginMessageProcessing(data);
        } else {
          this.verbose(2, "Не смогли получить steamID или сообщение игрока на изменение координат");
        }
      });
    }

    for (const command of this.options.target_designation_commands) {
      this.server.on(`CHAT_COMMAND:${command}`, (data) => {
        if (data.player?.steamID) {
          this.verbose(2, `${data.player.steamID} запросил целеуказание на ${data.message}`);
          this.targetDesignationMessageProcessing(data);
        } else {
          this.verbose(2, "Не смогли получить steamID игрока при целеуказании");
        }
      });
    }
  }

  async calcMessageProcessing(data) {
    const splittedMessage = data.message.replaceAll(/  +/g, " ").replaceAll(/ *- */g, "-").split(" ");

    if (splittedMessage.length === 2) {
      const [origin, target] = splittedMessage;

      await this.processingCalcWithTwoCords(data.player, origin, target);

      return;
    }

    if (splittedMessage.length === 1) {
      const target = splittedMessage[0];

      await this.processingCalcWithOneCord(data.player, target);

      return;
    }

    this.sendCalcHelp(data.player);
  }

  async setOriginMessageProcessing(data) {
    const origin = data.message.replaceAll(/  +/gu, " ").replaceAll(/ *- */gu, "-").toUpperCase();

    if (this.this.mortarCalc.validateGrid(origin)) {
      this.lastPlayerOrigin.set(data.player.steamID, origin);
      await this.warn(data.player.steamID, `Координаты пуска ${origin} установлены`);
    } else {
      await this.warn(data.player.steamID, "Координаты пуска нечитаемы");
    }
  }

  async targetDesignationMessageProcessing(data) {
    if (!data.message.trim()) {
      await this.sendTargetDesignationHelp(data.player);
      return;
    }

    const splittedMessage = data.message.replaceAll(/  +/g, " ").replaceAll(/ *- */g, "-").split(" ");

    if (!data.player.squadID) {
      await this.warn(data.player.steamID, "Вы должно быть в скваде чтобы использовать эту команду");
      return;
    }

    let isRoleValid = false;
    for (const validRole of this.options.valid_roles_for_designation) {
      if (data.player.role.match(validRole.role_regex)) {
        isRoleValid = true;
        break;
      }
    }

    if (!isRoleValid) {
      const validRolesText = this.options.valid_roles_for_designation
        .map((validRole) => validRole.readable_name)
        .join(", ");
      await this.warn(
        data.player.steamID,
        `Для отправки целеуказаний у вас должна быть одна из ролей: ${validRolesText}`
      );
      return;
    }

    if (splittedMessage.length === 1) {
      const target = splittedMessage[0];

      if (!this.mortarCalc.validateGrid(target)) {
        await this.warn(data.player.steamID, "Координаты цели нечитаемы");
        return;
      }

      await this.processingTargetDesignation(data.player, data.player.squadID, target, "");
      return;
    } else if (splittedMessage.length >= 2) {
      const target = splittedMessage[0];
      if (!this.mortarCalc.validateGrid(target)) {
        await this.warn(data.player.steamID, "Координаты цели нечитаемы");
        return;
      }

      const squadID = parseInt(splittedMessage[1]);

      if (!squadID) {
        await this.warn(data.player.steamID, "Вторым параметром нужно вводить номер сквада");
        return;
      }

      const message = splittedMessage.slice(2).join();

      await this.processingTargetDesignation(data.player, squadID, target, message);
      return;
    }
  }

  async processingCalcWithTwoCords(player, origin, target) {
    const isOriginValid = this.mortarCalc.validateGrid(origin);
    const isTargetValid = this.mortarCalc.validateGrid(target);

    if (!isOriginValid) {
      await this.warn(player.steamID, "Координаты пуска нечитаемы");
      return;
    }

    this.lastPlayerOrigin.set(player.steamID, origin.toUpperCase());

    if (!isTargetValid) {
      await this.warn(player.steamID, "Координаты цели нечитаемы");
      return;
    }

    const solution = this.mortarCalc.calculateSolution(origin, target);
    await this.warn(player.steamID, this.getSolutionText(solution, origin, target));
  }

  async processingCalcWithOneCord(player, target) {
    const isTargetValid = this.mortarCalc.validateGrid(target);

    if (!isTargetValid) {
      await this.warn(player.steamID, "Координаты цели нечитаемы");
      return;
    }

    const savedOrigin = this.lastPlayerOrigin.get(player.steamID);

    if (!savedOrigin) {
      await this.warn(player.steamID, "У вас нет сохраненной координаты, введите координаты пуска и цели");
      return;
    }

    const solution = this.mortarCalc.calculateSolution(savedOrigin, target);
    await this.warn(player.steamID, this.getSolutionText(solution, savedOrigin, target));
  }

  async processingTargetDesignation(player, squadID, target, message) {
    const squadLeader = this.getSquadLeaderBySquadID(squadID, player.teamID);

    if (!squadLeader) {
      await this.warn(player.steamID, "Указанный сквад не найден");
      return;
    }

    const playersWithOrigin = this.getPlayersWithOriginBySquad(squadID, player.teamID);

    for (const playerWithOrigin of playersWithOrigin) {
      const origin = this.lastPlayerOrigin.get(playerWithOrigin.steamID);

      const solution = this.mortarCalc.calculateSolution(origin, target);

      if (message) {
        await this.warns(playerWithOrigin.steamID, [
          `ЦУ от: ${player.name} | ${player.squadID}\n${this.getSolutionText(solution, origin, target)}`,
          message,
        ]);
      } else {
        await this.warn(
          playerWithOrigin.steamID,
          `ЦУ от: ${player.name} | ${player.squadID}\n${this.getSolutionText(solution, origin, target)}`
        );
      }
    }

    const squadLeaderOrigin = this.lastPlayerOrigin.get(squadLeader.steamID);

    if (squadLeaderOrigin) {
      const solution = this.mortarCalc.calculateSolution(squadLeaderOrigin, target);

      await this.warn(
        squadLeader.steamID,
        `ЦУ от: ${player.name} | ${player.squadID}\n${this.getSolutionText(solution, squadLeaderOrigin, target)}`
      );
    } else {
      await this.warn(
        squadLeader.steamID,
        `ЦУ от: ${player.name} | ${player.squadID}\n-> ${target.toUpperCase()}\nЧтобы получать расчет - задай свои координаты командой !${this.options.set_origin_commands[0]}`
      );
    }

    const countPlayersMessage = playersWithOrigin.length > 0 ? ` и его ${playersWithOrigin.length} бойцам` : "";
    await this.warn(player.steamID, `Целеуказание передано ${squadLeader.name}${countPlayersMessage}`);
  }

  async sendCalcHelp(player) {
    await this.warns(player.steamID, [
      `Введите 2 координаты - места пуска и цели\nНапример: !${this.options.calc_commands[0]} E5-26 c2-29`,
      "Форматы координат:\nB5\na7\nF03\nA1-12\nE5-267",
      "Разбор формата на примере E5-267\nE5 - квадрат 300 м.\n2 - квадрат 100 м. внутри E5\n6 - квадрат 33 м. внутри 2\n7 - квадрат 11 м. внутри 6",
      `Координата места пуска запоминается, в дальнейшем можно вводить только координату цели\nНапример: !${this.options.calc_commands[0]} E5-267`,
      `Задать свои координаты можно также командой !${this.options.set_origin_commands[0]} координаты`,
    ]);
  }

  async sendTargetDesignationHelp(player) {
    await this.warns(player.steamID, [
      `Команда целеуказания расчитывает цель для определенного сквадного и его бойцов`,
      `Варианты команды:\n!${this.options.target_designation_commands[0]} координаты - отправит целеуказание вашему скваду`,
      `!${this.options.target_designation_commands[0]} координаты номер_сквада - отправит целеуказание указанному скваду`,
      `!${this.options.target_designation_commands[0]} координаты номер_сквада сообщение - отправит целеуказание с сообщением`,
      `Задать свои координаты можно командой !${this.options.set_origin_commands[0]} координаты`,
      `Или же координаты записываются по последнему полному расчету командой !${this.options.calc_commands[0]} коорд. коорд.`,
    ]);
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

  getPlayersWithOriginBySquad(squadID, teamID) {
    return this.server.players.filter(
      (player) =>
        player.squadID === squadID &&
        player.teamID === teamID &&
        !player.isLeader &&
        this.lastPlayerOrigin.has(player.steamID)
    );
  }

  getSquadLeaderBySquadID(squadID, teamID) {
    return this.server.players.find(
      (player) => player.squadID === squadID && player.teamID === teamID && player.isLeader
    );
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
