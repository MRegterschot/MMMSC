import { Op, QueryTypes, type Sequelize } from "sequelize";
import MMMPoints from "../../../userdata/schemas/mmmpoints.model";
import type { Map } from "../../mapmanager";
import Confirm from "../../ui/confirm";
import ListWindow from "@core/ui/listwindow";
import { formatTime, htmlEntities, clone, removeColors } from "../../utils";
import MapLikes from "@core/schemas/maplikes.model";

enum Medals {
    Author = 0,
    Gold = 1,
    Silver = 2,
    Bronze = 3,
    None = 4,
}

export default class MapsWindow extends ListWindow {
    params: string[] = [];
    template: string = 'core/plugins/maps/maplist.xml.twig';;
    pageSize = 32;
    ranks: { [key: string]: { mapUid: string; rank: number; medal: Medals }[] } = {};

    constructor(login: string, params: string[]) {
        super(login);
        this.params = params;
        this.recipient = login;
    }

    async uiPaginate(login: string, answer: any, entries: any): Promise<void> {
        let maps: any = [];
        let i = 1;
        let serverMaps = clone(tmc.maps.get());
        await this.getPersonalRank(login, serverMaps);
        for (const map of serverMaps) {
            if (
                !this.params[0] ||
                removeColors(map.Name).toLocaleLowerCase().indexOf(this.params[0].toLocaleLowerCase()) !== -1 ||
                removeColors(map.AuthorName).toLocaleLowerCase().indexOf(this.params[0].toLocaleLowerCase()) !== -1
            ) {
                let mapLikes = await this.getMapLikes(map.UId);
                maps.push(
                    Object.assign(map, {
                        Index: i++,
                        Name: htmlEntities(map.Name),
                        AuthorName: htmlEntities(map.AuthorNickname || map.Author || ''),
                        ATime: formatTime(map.AuthorTime || map.GoldTime),
                        MapLikes: mapLikes.percentage,
                        MapLikesTotal: mapLikes.total,
                        Rank: this.ranks[login].find((rank) => rank.mapUid == map.UId)?.rank || 99999,
                        Medal: this.ranks[login].find((rank) => rank.mapUid == map.UId)?.medal ?? Medals.None,
                    })
                );
            }
        }
        this.setItems(maps);
        super.uiPaginate(login, answer, entries);
    }

    async onPageItemsUpdate(items: any) {
        if (items.length == 0) return items;
        if (items[0]?.Rank) return items;
        const sequelize: Sequelize = tmc.storage['db'];
        if (sequelize) {
            const uids = items.map((val: any) => val.UId);
            const login = this.recipient;
            const rankings: any[] = await sequelize.query(
                `SELECT * FROM (
                SELECT mapUuid as Uid, login, time, RANK() OVER (PARTITION BY mapUuid ORDER BY time ASC) AS playerRank
                FROM scores WHERE mapUuid in (?)
                ) AS t WHERE login = ?`,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: [uids, login]
                }
            );
            for (const item of items) {
                const rank =
                    rankings.find((val) => {
                        return item.UId == val.Uid;
                    })?.playerRank || '-';
                item.Rank = rank;
            }
        }
        return items;
    }

    async onAction(login: string, action: string, item: any) {
        if (action == 'Queue') {
            await tmc.chatCmd.execute(login, '/addqueue ' + item.UId);
        }
    }

    async applyCommand(login: string, action: string) {
        await tmc.chatCmd.execute(login, action);
        await this.uiPaginate(login, "", []);
    }

    async getPersonalRank(login: string, maps: Map[]) {
        const mmmPoints = await MMMPoints.findAll({
            where: {
                login: login,
                mapUid: {
                    [Op.in]: maps.map((map) => map.UId),
                },
            },
        });

        this.ranks[login] = mmmPoints.map((point) => {
            let medal = Medals.None;

            if (point.time <= (maps.find((map) => map.UId == point?.mapUid)?.AuthorTime ?? 0)) {
                medal = Medals.Author;
            } else if (point.time <= (maps.find((map) => map.UId == point?.mapUid)?.GoldTime ?? 0)) {
                medal = Medals.Gold;
            } else if (point.time <= (maps.find((map) => map.UId == point?.mapUid)?.SilverTime ?? 0)) {
                medal = Medals.Silver;
            } else if (point.time <= (maps.find((map) => map.UId == point?.mapUid)?.BronzeTime ?? 0)) {
                medal = Medals.Bronze;
            }

            return {
                mapUid: point.mapUid ?? "",
                rank: point.rank ?? 99999,
                medal: medal,
            };
        });
    }

    async getMapLikes(mapUid: string) {
        const likes = await MapLikes.findAll({
            where: {
                mapUuid: mapUid,
            },
        });

        let positive = 0;
        let total = 0;

        for (const like of likes) {
            if (!like.vote) continue;
            if (like.vote > 0) {
                positive++;
            }
            total++;
        }

        let percentage = "No Votes";
        
        if (total > 0) {
            percentage = ((positive / total * 100).toFixed(0) || 0) + "%";
        }

        return {
            percentage,
            total,
        };
    }
}
