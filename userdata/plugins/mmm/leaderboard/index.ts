import Plugin from "../../../../core/plugins";
import MMMPoints from "../../../schemas/mmmpoints.model";
import MMMRank from "../../../schemas/mmmrank.model";
import PointsWindow from "./pointsWindow";
import LeaderboardWindow from "./leaderboardWindow";
import { clone, htmlEntities, formatTime } from "../../../../core/utils";
import Player from "../../../../core/schemas/players.model";
import RanksWindow from "./ranksWindow";
import PointsHistory from "../../../schemas/pointshistory.model";
import RankHistory from "../../../schemas/rankhistory.model";
import Confirm from "@core/ui/confirm";

interface MMMScore {
    points: number;
    rank: number;
}

const rankNames: { [key: number]: any } = {
    0: {
        name: "Beginner",
        color: "$FFF",
    },
    2500: {
        name: "Bronze",
        color: "$B60",
    },
    5000: {
        name: "Silver",
        color: "$BBB",
    },
    10000: {
        name: "Gold",
        color: "$FC0",
    },
    25000: {
        name: "Emerald",
        color: "$0D0",
    },
    50000: {
        name: "Diamond",
        color: "$0EF",
    },
    100000: {
        name: "Master",
        color: "$A2F",
    },
    200000: {
        name: "Grandmaster",
        color: "$C20",
    },
    333333: {
        name: "Gigamaster",
        color: "$E8F",
    },
    500000: {
        name: "Minimaster",
        color: "$F70",
    },
};

const rankChangeMessages: { [key: string]: string[] } = {
    promoted: ["EZ", "Nice", "Good job", "Well done", "Congratulations", "Amazing", "Incredible", "Unbelievable", "YIPPIE"],
    demoted: ["RIP", "Oof", "Unlucky", "Bad luck", "Better luck next time", "Try harder", "You can do it", "You got this", "Keep going", "Don't give up", "LOL"],
}

export default class Leaderboard extends Plugin {
    static depends: string[] = ["game:Trackmania", "database"];

    leaderboard: MMMRank[] = [];
    records: any[] = [];
    startRecords: MMMPoints[] = [];

    async onLoad() {
        try {
            await tmc.server.call("ChatEnableManualRouting", true, false);
            tmc.server.addListener("Trackmania.PlayerChat", this.onPlayerChat, this);
        } catch (e: any) {
            tmc.cli("ChatPlugin: ¤error¤ " + e.message);
        }

        tmc.storage["db"].addModels([MMMRank, MMMPoints, PointsHistory, RankHistory]);
        tmc.server.addListener("Trackmania.EndMap_Start", this.onEndMap, this);
        tmc.server.addListener("Trackmania.BeginMap", this.onBeginMap, this);
        tmc.server.addListener("TMC.PlayerFinish", this.onPlayerFinish, this);
        tmc.chatCmd.addCommand("/leaderboard", this.cmdLeaderboard.bind(this), "Display MMM Leaderboard");
        tmc.chatCmd.addCommand("/points", this.cmdPoints.bind(this), "Display points");
        tmc.chatCmd.addCommand("/ranks", this.cmdRanks.bind(this), "Display ranks");
        tmc.chatCmd.addCommand("//deletepoints", this.cmdDeletePoints.bind(this), "Delete points");
        tmc.chatCmd.addCommand("//fatasswizardcastsafireball", this.cmdRemoveMapAndPoints.bind(this), "Remove map and points");
    }

    async onUnload() {
        try {
            await tmc.server.call("ChatEnableManualRouting", false, false);
        } catch (e: any) {
            console.log(e.message);
        }
        tmc.server.removeListener("Trackmania.EndMap_Start", this.onEndMap.bind(this));
        tmc.server.removeListener("Trackmania.BeginMap", this.onBeginMap.bind(this));
        tmc.server.removeListener("TMC.PlayerFinish", this.onPlayerFinish.bind(this));
        tmc.server.removeListener("Trackmania.PlayerChat", this.onPlayerChat);
        tmc.chatCmd.removeCommand("/leaderboard");
        tmc.chatCmd.removeCommand("/points");
        tmc.chatCmd.removeCommand("/ranks");
        tmc.chatCmd.removeCommand("//deletepoints");
    }
    
    async onStart() {
        const menu = tmc.storage["menu"];
        if (menu) {
            menu.addItem({
                category: "Players",
                title: "Show: Leaderboard",
                action: "/leaderboard",
            });
            
            menu.addItem({
                category: "Map",
                title: "Show: Points",
                action: "/points",
            });

            menu.addItem({
                category: "Server",
                title: "Show: Ranks",
                action: "/ranks",
            });
        }
        
        await this.calculateFullPointsAndRanks();

        if (!tmc.maps.currentMap?.UId) return;
        await this.syncRecords();
    }

    async onPlayerFinish(data: any) {
        const login = data[0];
        const player = await tmc.players.getPlayer(login);
        try {
            let scores = await MMMPoints.findAll({
                where: {
                    mapUid: tmc.maps.currentMap?.UId,
                },
                order: [["rank", "ASC"]],
                include: [Player],
            });

            let firsRecord = clone(scores[0]);
            let score: any = scores.find((score: MMMPoints) => score.login === login);
            let prevScore = clone(score);

            let newScore = false;

            if (!score) {
                newScore = true;
                score = {
                    login: login,
                    time: data[1],
                };
            } else {
                if (score.time <= data[1]) return;
                score.time = data[1];
            }

            let mmmScores = this.calculateLogarithmicPoints(newScore ? [...scores, score] : scores);

            if (newScore) {
                let mmmScore = mmmScores.find((mmmScore) => mmmScore.score.login === login);

                if (!mmmScore) return;

                score = await MMMPoints.create({
                    login: login,
                    mapUid: tmc.maps.currentMap?.UId,
                    points: mmmScore.mmmScore.points,
                    rank: mmmScore.mmmScore.rank,
                    time: data[1],
                });

                scores.push(score);
            }

            scores = scores.sort((a, b) => a.time - b.time);

            this.records = [];

            for (let mmmScore of mmmScores) {
                // @ts-expect-error
                let name = mmmScore.score?.player?.nickname;

                if (!name) {
                    let player = await tmc.players.getPlayer(mmmScore.score.login || "");
                    name = player.nickname;
                }

                this.records.push({
                    login: mmmScore.score.login,
                    formattedTime: formatTime(mmmScore.score.time),
                    points: mmmScore.mmmScore.points,
                    rank: mmmScore.mmmScore.rank,
                    nickname: htmlEntities(name),
                });
            }

            let playerScore = mmmScores.find((score) => score.score.login === login);

            if (!playerScore) return;

            if (playerScore.mmmScore.rank === 1) {
                tmc.server.emit("Plugin.MMMRecords.onNewRecord", {
                    record: {
                        nickname: player.nickname,
                        time: playerScore.score.time,
                        points: playerScore.mmmScore.points - (prevScore?.points ?? 0),
                    },
                    oldRecord: {
                        time: firsRecord?.time,
                    },
                    records: clone(this.records),
                });
            } else {
                tmc.server.emit("Plugin.MMMRecords.onUpdateRecord", {
                    record: {
                        login: player.login,
                        nickname: player.nickname,
                        time: playerScore.score.time,
                        points: playerScore.mmmScore.points,
                        rank: playerScore.mmmScore.rank,
                    },
                    oldRecord: {
                        nickname: player.nickname,
                        time: prevScore?.time,
                        points: prevScore?.points ?? 0,
                        rank: prevScore?.rank,
                    },
                    records: clone(this.records),
                });
            }

            for (let score of scores) {
                let mmmScore = mmmScores.find((mmmScore) => mmmScore.score.login === score.login);
                if (!mmmScore) return;

                score.set({
                    points: mmmScore.mmmScore.points,
                    rank: mmmScore.mmmScore.rank,
                });
                await score.save();

                PointsHistory.create({
                    login: score.login,
                    mapUid: tmc.maps.currentMap?.UId,
                    time: score.time,
                    rank: mmmScore.mmmScore.rank,
                    points: mmmScore.mmmScore.points,
                });
            }
        } catch (e: any) {
            console.log(e);
        }
    }

    async cmdLeaderboard(login: string, args: string[]) {
        const ranks = await MMMRank.findAll({
            order: [["rank", "ASC"]],
            include: [
                {
                    model: tmc.storage["db"].models["Player"],
                    as: "player",
                },
            ],
        });

        let rankList: { rank: number | null; nickname: string; login: string | undefined; points: number }[] = [];
        for (const rank of ranks) {
            rankList.push({
                rank: rank.rank,
                // @ts-expect-error
                nickname: htmlEntities(rank.player?.nickname ?? (await tmc.players.getPlayer(rank.login))?.nickname ?? ""),
                login: rank.login,
                points: rank.totalPoints,
            });
        }

        const window = new LeaderboardWindow(login, this);
        window.size = { width: 90, height: 95 };
        window.title = `Leaderboard [${ranks.length}]`;
        window.setItems(rankList);
        window.setColumns([
            { key: "rank", title: "Rank", width: 10 },
            { key: "nickname", title: "Nickname", width: 50 },
            { key: "points", title: "Points", width: 20 },
        ]);

        await window.display();
    }

    async cmdPoints(login: string, args: string[]) {
        const points = await MMMPoints.findAll({
            where: {
                mapUid: tmc.maps.currentMap?.UId,
            },
            order: [["rank", "ASC"]],
            include: [
                {
                    model: tmc.storage["db"].models["Player"],
                    as: "player",
                },
            ],
        });

        let pointsList: { nickname: string; login: string | undefined; points: number; rank: number | null; time: string }[] = [];

        for (const point of points) {
            pointsList.push({
                // @ts-expect-error
                nickname: point.player?.nickname ?? (await tmc.players.getPlayer(point.login))?.nickname ?? point.login,
                login: point.login,
                points: point.points,
                rank: point.rank,
                time: "$o" + formatTime(point.time ?? 0),
            });
        }

        const window = new PointsWindow(login, this);
        window.size = { width: 110, height: 95 };
        window.title = `Map Points [${points.length}]`;
        window.setItems(pointsList);
        window.setColumns([
            { key: "rank", title: "Rank", width: 10 },
            { key: "nickname", title: "Nickname", width: 50 },
            { key: "points", title: "Points", width: 20 },
            { key: "time", title: "Time", width: 20 },
        ]);

        await window.display();
    }

    async cmdDeletePoints(login: string, args: string[]) {
        if (args.length < 1) {
            tmc.chat("Usage: //deletepoints <mapUid>");
            return;
        }

        if (!tmc.settings.isMasterAdmin(login)) {
            tmc.chat("You don't have permission to use this command!");
            return;
        }

        const confirm = new Confirm(login, "Are you sure?", async () => {
            for (let mapUid of args) {
                await MMMPoints.destroy({
                    where: {
                        mapUid: mapUid,
                    },
                });
            }

            tmc.chat("¤info¤Points deleted!", login);
        }, []);
        
        await confirm.display();
    }

    async cmdRemoveMapAndPoints(login: string, args: string[]) {
        if (!tmc.settings.isMasterAdmin(login)) {
            tmc.chat("You don't have permission to use this command!");
            return;
        }

        let mapUid = tmc.maps.currentMap?.UId;

        if (args.length > 0) {
            mapUid = args[0];
        }

        const confirm = new Confirm(login, "Are you sure?", async () => {
            await MMMPoints.destroy({
                where: {
                    mapUid
                },
            });

            tmc.chatCmd.execute(login, "//remove " + mapUid);

            if (mapUid == tmc.maps.currentMap?.UId) await tmc.server.call("NextMap");

            tmc.chatCmd.execute(login, "//wml");
            tmc.chat("¤info¤Map and points removed!", login);
        }, []);

        await confirm.display();
    }


    async cmdRanks(login: string, args: string[]) {
        const window = new RanksWindow(login, this);
        window.size = { width: 70, height: 75 };
        window.title = `Ranks`;

        const rankNamesArray = Object.entries(rankNames).map(([score, details]) => ({
            score: Number(score),
            name: details.name,
        }));
        
        window.setItems(rankNamesArray);
        window.setColumns([
            { key: "score", title: "Score", width: 20 },
            { key: "name", title: "Name", width: 40 },
        ]);

        await window.display();
    }

    async onBeginMap(data: any) {
        tmc.server.emit("Plugin.Log", "maps", {
            timestamp: new Date().toLocaleTimeString(),
            map: tmc.maps.currentMap ?? data[0]
        });

        await this.syncRecords();
    }

    async onEndMap(data: any) {
        tmc.chat("Don't forget to vote for the map!");

        if (tmc.maps.getMaplist()[tmc.maps.getMapCount() - 1]?.UId == tmc.maps.currentMap?.UId) {
            await this.shuffleList();
        }

        this.calculatePointDiff();
        this.calculateFullPointsAndRanks();
    }

    async shuffleList() {
        try {
            let maps = await tmc.server.call("GetMapList", -1, 0);
            maps = maps.sort(() => Math.random() - 0.5);
            let toserver: string[] = [];
            for (const map of maps) {
                toserver.push(map.FileName);
            }
            await tmc.server.call("RemoveMapList", toserver);
            tmc.server.send("AddMapList", toserver);
            await tmc.maps.syncMaplist();
            tmc.chat(`¤info¤Rotation completed, shuffling maplist...`);
            tmc.cli(`Rotation completed, shuffling maplist...`);
        } catch (err: any) {
            tmc.cli(`Error: ${err.message}`);
        }
    }

    async syncLeaderboard(ranks: MMMRank[] | undefined = undefined) {
        if (!ranks)
            ranks = await MMMRank.findAll({
                order: [["rank", "ASC"]],
                include: [Player],
            });

        this.leaderboard = ranks;

        tmc.server.emit("Plugin.MMMLeaderboard.onSync", {
            leaderboard: clone(this.leaderboard),
        });
    }

    async syncRecords() {
        let mapUid = tmc.maps.currentMap?.UId;

        const records = await MMMPoints.findAll({
            where: {
                mapUid: mapUid,
            },
            order: [["points", "DESC"]],
            include: [Player],
        });

        this.startRecords = clone(records);


        this.records = [];

        for (const record of records) {
            // @ts-expect-error
            let name = record.player?.nickname;

            if (!name) {
                let player = await tmc.players.getPlayer(record.login || "");
                
                if (player) {
                    name = player.nickname;
                } else {
                    name = record.login;
                }
            }

            this.records.push({
                login: record.login,
                formattedTime: formatTime(record.time),
                points: record.points,
                rank: record.rank,
                nickname: htmlEntities(name),
            });
        }

        tmc.server.emit("Plugin.MMMRecords.onSync", {
            mapUid: mapUid,
            records: clone(this.records),
        });
    }

    async calculateFullPointsAndRanks() {
        let points = await MMMPoints.findAll();

        let playerScores: { [key: string]: number } = {};

        points.forEach((point) => {
            const login = point.login ?? "";
            if (!playerScores[login]) {
                playerScores[login] = 0;
            }
            playerScores[login] += point.points;
        });

        for (const login of Object.keys(playerScores)) {
            let playerRank = await MMMRank.findOne({
                where: {
                    login: login,
                },
            });

            let prevScore = playerRank?.totalPoints ?? 0;

            if (!playerRank) {
                playerRank = await MMMRank.create({
                    login: login,
                    totalPoints: playerScores[login],
                    rankName: "Beginner",
                });
            } else {
                playerRank.set({
                    totalPoints: playerScores[login],
                });
                await playerRank.save();
            }

            if (prevScore != playerScores[login]) {
                RankHistory.create({
                    login: login,
                    rank: playerRank.rank,
                    totalPoints: playerScores[login],
                    rankName: playerRank.rankName,
                });
            }
        }

        this.calculatePlayerRanks();
    }

    async calculatePointDiff() {
        this.records.forEach(async (record) => {
            let startRecord = this.startRecords.find((startRecord) => startRecord.login === record.login);

            let diff = record.points - (startRecord?.points ?? 0);

            if (diff > 0) {
                tmc.chat(`You gained ${diff} points!`, record.login);
            } else if (diff < 0) {
                tmc.chat(`You lost ${diff * -1} points!`, record.login);
            }
        });
    }

    async onPlayerChat(data: any) {
        if (data[0] == 0) return;
        if (data[2].startsWith("/")) return;

        const player = await tmc.getPlayer(data[1]);
        const playerRank = await MMMRank.findOne({
            where: {
                login: player.login,
            },
        });
        const nick = player.nickname.replaceAll(/\$[iwozs]/gi, "");
        const text = data[2];

        let playerRankRange = this.getPlayerRankRange(playerRank);

        let msg = `${nick} $z$s» ${text}`;

        if (playerRank?.rank && playerRank?.rank != 0) {
            msg = `${playerRankRange.color}[${playerRank?.rank}]$fff ${msg}`;
        }

        tmc.server.send("ChatSendServerMessage", msg);
        tmc.cli(msg);

        tmc.server.emit("Plugin.Log", "messages", {
            timestamp: new Date().toLocaleTimeString(),
            login: player.login,
            nickname: player.nickname,
            message: text,
        });
    }

    getPlayerRankRange(playerRank: MMMRank | null) {
        // find the rank name where the players total points is more than the highest rank
        let rankName = "Beginner";
        let color = "$FFF";
        for (let rank of Object.keys(rankNames)) {
            if ((playerRank?.totalPoints ?? 0) >= parseInt(rank)) {
                rankName = rankNames[parseInt(rank)].name;
                color = rankNames[parseInt(rank)].color;
            }
        }

        return {
            rankName,
            color,
        };
    }

    async calculatePlayerRanks() {
        const players = await MMMRank.findAll({
            include: [Player],
        });

        const sortedPlayers = players.sort((a, b) => b.totalPoints - a.totalPoints);

        for (let i = 0; i < sortedPlayers.length; i++) {
            let playerRankRange = this.getPlayerRankRange(sortedPlayers[i]);

            let rankName = sortedPlayers[i].rankName;

            if (playerRankRange.rankName !== sortedPlayers[i].rankName) {
                // find the points of the rank names
                let oldPoints = Object.keys(rankNames).find((key) => rankNames[key as any].name === sortedPlayers[i].rankName);
                let newPoints = Object.keys(rankNames).find((key) => rankNames[key as any].name === playerRankRange.rankName);

                let status = "promoted";
                
                if (parseInt(oldPoints ?? "0") > parseInt(newPoints ?? "0")) {
                    status = "demoted";
                }
                
                let rankChangeMessage = rankChangeMessages[status][Math.floor(Math.random() * rankChangeMessages[status].length)];
                rankName = playerRankRange.rankName;

                tmc.chat(
                    // @ts-expect-error
                    `$fff${sortedPlayers[i].player?.nickname ?? (await tmc.players.getPlayer(sortedPlayers[i].login) ?? "").nickname} ¤info¤${status} to $fff${playerRankRange.color}${
                        playerRankRange.rankName
                    }! $fff${rankChangeMessage}!`
                );
            }

            await sortedPlayers[i].update({
                rank: i + 1,
                rankName: rankName,
            });
        }

        tmc.cli("Ranks updated!");

        this.syncLeaderboard(sortedPlayers);
    }

    calculateLogarithmicPoints(scores: MMMPoints[], minValue: number = 0.2, multiplier: number = 1000): { score: MMMPoints; mmmScore: MMMScore }[] {
        // Sort scores based on their score (lowest score is the best) if same time, then updated time
        const sortedScores = scores.sort((a, b) => {
            // First compare by time if both have the `time` property
            if (a.time && b.time) {
                const timeDiff = a.time - b.time;
                // If the times are different, return the difference
                if (timeDiff !== 0) {
                    return timeDiff;
                }
            }
            // If times are the same (or one is missing), sort by updatedAt
            if (a.updatedAt && b.updatedAt) {
                return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
            }
            return 0;
        });

        // Total number of scores
        const total = sortedScores.length;

        // Custom log function with fixed base (dropoffFactor = 10)
        const logBase = (x: number): number => {
            const dropoffFactor = 10; // Fixed dropoffFactor
            return Math.log(x) / Math.log(dropoffFactor); // Change the log base using dropoffFactor 10
        };

        // Function to calculate logarithmic points with min value control and rounding up
        const calculatePoints = (position: number, total: number, minValue: number): number => {
            const maxLog = logBase(total + 1); // Log with fixed dropoffFactor (10)
            const normalizedPoints = (maxLog - logBase(position)) / maxLog;

            // Scale and shift the points to ensure a minimum value
            return normalizedPoints * (1 - minValue) + minValue;
        };

        // Assign logarithmic points based on the position (which is determined by score)
        return scores.map((scoreEntry) => {
            // Find the index of the current scoreEntry in the sorted array
            const position = sortedScores.findIndex((item) => item.login === scoreEntry.login) + 1;
            const points = Math.ceil(calculatePoints(position, total, minValue) * multiplier);
            const mmmScore = { points, rank: position } as MMMScore;
            return { score: scoreEntry, mmmScore };
        });
    }
}
