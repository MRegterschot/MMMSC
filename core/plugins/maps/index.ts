import tm from 'tm-essentials';
import MapsWindow from './mapsWindow';
import { clone, escape } from 'core/utils';
import Plugin from 'core/plugins';
import QueueWindow from './queueWIndow';

export interface Map {
    UId: string;
    File: string;
    Name: string;
    Author: string;
    AuthorTime: number;
    Environment: string;
    QueueBy: string;
    QueueNickName: string;
}

export default class Maps extends Plugin {
    queue: Map[] = [];

    async onLoad() {
        tmc.addCommand("/maps", this.cmdMaps.bind(this), "Display maps list");
        tmc.addCommand("/list", this.cmdMaps.bind(this), "Display maps list");
        tmc.addCommand("/addqueue", this.cmdQueue.bind(this), "Add Map to queue");
        tmc.addCommand("/jb", this.cmdListQueue.bind(this), "List maps in queue");
        tmc.addCommand("/drop", this.cmdDrop.bind(this), "Drop Map from queue");
        tmc.addCommand("//cjb", this.cmdClearQueue.bind(this), "clear queue");
        if (tmc.game.Name === "TmForever") {        
            tmc.server.addListener("Trackmania.EndRace", this.onEndRace, this);        
        } else {
            tmc.server.addListener("Trackmania.Podium_Start", this.onEndRace, this);        
        }
    }

    async onUnload() {
        tmc.server.removeListener("Trackmania.EndMap", this.onEndRace);
        tmc.server.removeListener("Trackmania.Podium_Start", this.onEndRace);
        tmc.removeCommand("//cjb");
        tmc.removeCommand("/jb");
        tmc.removeCommand("/addqueue");
        tmc.removeCommand("/drop");
        tmc.removeCommand("/maps");
        tmc.removeCommand("/list");
        tmc.storage["menu"]?.removeItem("Map List");
        tmc.storage["menu"]?.removeItem("Map Queue");
    }

    async onStart(): Promise<void> {
        if (tmc.storage["menu"]) {
            tmc.storage["menu"].addItem({
                category: "Map",
                title: "Show: List",
                action: "/maps"
            });
            tmc.storage["menu"].addItem({
                category: "Map",
                title: "Show: Queue",
                action: "/jb"
            });
        }
    }

    async cmdQueue(login: any, params: string[]) {
        let map: any = null;
        if (process.env.DISABLE_MAP_QUEUE == "true") {
            tmc.chat("¤info¤Map queue is disabled", login);
            return;
        }
        if (params.length == 0) {
            tmc.chat("¤info¤Usage: /addqueue <map index|map uid>", login);
            return;
        }        
        if (params[0].toString().length < 5) {
            let index = Number.parseInt(params[0]) - 1;
            map = tmc.maps.getMaplist()[index];
        } else {
            map = tmc.maps.getMaplist().find((m: any) => m.UId == params[0]);
        }
        if (!map) {
            tmc.chat("¤info¤map not found", login);
            return;
        }
        const player = await tmc.players.getPlayer(login);
        const previous = this.queue.find(m => m.QueueBy === login);
        if (previous && !player.isAdmin) {
            tmc.chat("¤info¤You already have a map in queue", login);
            return;
        }
        if (this.queue.find(m => m.UId === map.UId)) {
            tmc.chat("¤info¤Map already in queue", login);
            return;
        }   
        this.queue.push({
            UId: map.UId,
            File: map.FileName,
            Name: map.Name,
            Author: map.AuthorNickname || map.Author,
            AuthorTime: map.AuthorTime,
            Environment: map.Environnement,
            QueueBy: login,
            QueueNickName: escape(player.nickname),
        });
        tmc.chat(`¤info¤Map $fff${map.Name} ¤info¤added to the queue by $fff${player.nickname}`);
    }

    async cmdDrop(login: any, args: string[]) {
        const player = await tmc.players.getPlayer(login);
        let index = 0;
        let map: any = null;
        if (player.isAdmin && args.length > 0) {
            index = parseInt(args[0]) - 1;
            map = this.queue[index];
        } else {
            map = this.queue.find(m => m.QueueBy === login);
            index = this.queue.findIndex(m => m == map);
            if (index === -1) {
                tmc.chat(`¤info¤You don't have any map in queue`, login);
                return;
            }
        }

        if (map) {
            this.queue.splice(index, 1);
            tmc.chat(`¤info¤Map $fff${map.Name} ¤info¤dropped from the queue by $fff${map.QueueNickName}`);
        } else {
            tmc.chat(`¤info¤You don't have any map in queue`, login);
        }
    }

    async cmdClearQueue(login: any, args: string[]) {
        this.queue = [];
        tmc.chat("¤info¤Map queue cleared");
    }

    async onEndRace(data: any) {
        if (this.queue.length > 0) {
            const map = this.queue.shift();
            if (map) {
                await tmc.server.call("ChooseNextMap", map.File);
                tmc.chat(`¤info¤Map $fff${map.Name} ¤info¤chosen by $fff${map.QueueNickName}`);
            }
        }
    }


    async cmdMaps(login: any, args: string[]) {
        const window = new MapsWindow(login);       
        window.size = { width: 180, height: 105 };
        window.setColumns([
            { key: "Index", title: "#", width: 4 },
            { key: "Name", title: "Name", width: 50, action: "Queue" },
            { key: "Author", title: "Author", width: 30 },
            { key: "Environnement", title: "Environment", width: 25 },
            { key: "GoldTime", title: "Gold Time", width: 25 }
        ]);
        window.title = "Maps [" + tmc.maps.getMapCount() + "]";
        window.setActions(["Queue"]);
        if (tmc.admins.includes(login)) {
            window.setActions(["Queue", "Trash"]);
        }

        await window.display()
    }

    async cmdListQueue(login: any, args: string[]) {
        const window = new QueueWindow(login);
        const maps = [];
        let i = 1;
        for (const map of clone(this.queue)) {
            maps.push(
                Object.assign(map, {
                    Index: i++,
                    Name: escape(map.Name),
                    Author: escape(map.Author),
                    AuthorTime: tm.Time.fromMilliseconds(map.AuthorTime).toTmString()
                })
            );
        }
        window.title = "Map Queue (" + maps.length + ")";
        window.size = { width: 205, height: 95 };
        window.setItems(maps);
        window.setColumns([
            { key: "Index", title: "#", width: 4 },
            { key: "Name", title: "Name", width: 50 },
            { key: "Author", title: "Author", width: 30 },
            { key: "Environment", title: "Environment", width: 25 },
            { key: "QueueNickName", title: "Wish by", width: 50 }
        ]);

        window.setActions(["Drop"]);
        await window.display()
    }

}