import type { Player } from "../../../../../../core/playermanager";
import Plugin from "../../../../../../core/plugins";
import Widget from "../../../../../../core/ui/widget";
import { htmlEntities } from "../../../../../../core/utils";

export default class MMMWidget extends Plugin {
    static depends: string[] = ["mmm/leaderboard"];
    widgets: { [key: string]: Widget } = {};
    leaderboard: any[] = [];

    async onLoad() {
        tmc.server.addListener("TMC.PlayerConnect", this.onPlayerConnect, this);
        tmc.server.addListener("TMC.PlayerDisconnect", this.onPlayerDisconnect, this);
        tmc.server.addListener("Plugin.MMMLeaderboard.onSync", this.onSync, this);
        tmc.server.addListener("Plugin.MMMLeaderboard.onRefresh", this.onSync, this);
        tmc.server.addListener("Plugin.MMMLeaderboard.onUpdateLeaderboard", this.onUpdateLeaderboard, this);
        tmc.server.addListener("Plugin.MMMLeaderboard.onNewLeaderboard", this.onNewLeaderboard, this);
    }

    async onPlayerConnect(player: Player) {
        const login = player.login;
        await this.updateWidget(login);
        if (this.widgets[login]) {
            await tmc.ui.displayManialink(this.widgets[login]);
        }
    }

    async onPlayerDisconnect(player: Player) {
        const login = player.login;
        if (this.widgets[login]) {
            delete this.widgets[login];
        }
    }

    async onUnload() {
        for (const login of Object.keys(this.widgets)) {
            delete this.widgets[login];
        }
        tmc.server.removeListener("TMC.PlayerConnect", this.onPlayerConnect);
        tmc.server.removeListener("TMC.PlayerDisconnect", this.onPlayerDisconnect);
        tmc.server.removeListener("Plugin.MMMLeaderboard.onSync", this.onSync);
        tmc.server.removeListener("Plugin.MMMLeaderboard.onRefresh", this.onSync);
        tmc.server.removeListener("Plugin.MMMLeaderboard.onUpdateLeaderboard", this.onUpdateLeaderboard);
        tmc.server.removeListener("Plugin.MMMLeaderboard.onNewLeaderboard", this.onNewLeaderboard);
    }

    async onSync(data: any) {
        this.leaderboard = data.leaderboard;
        await this.updateWidgets();
    }

    async onNewLeaderboard(data: any) {
        this.leaderboard = data.leaderboard;
        await this.updateWidgets();
    }

    async onUpdateLeaderboard(data: any) {
        this.leaderboard = data.leaderboard;
        await this.updateWidgets();
    }

    async updateWidgets() {
        for (const player of tmc.players.getAll()) {
            await this.updateWidget(player.login);
        }
        await tmc.ui.displayManialinks(Object.values(this.widgets));
    }

    async toggleWidget(login: string, value: number) {
        if (value > 0) {
            this.widgets[login].pos = { x: -160, y: 75 };
            this.widgets[login].setData({ ...this.widgets[login].data, open: true });
        } else {
            this.widgets[login].pos = { x: -205, y: 75 };
            this.widgets[login].setData({ ...this.widgets[login].data, open: false });
        }

        await tmc.ui.displayManialink(this.widgets[login]);
    }

    async updateWidget(login: string) {
        let widget = this.widgets[login];
        if (!widget) {
            widget = new Widget("userdata/plugins/mmm/leaderboard/widgets/leaderboard/widget.twig");
            widget.title = "Leaderboard";
            widget.recipient = login;
            widget.pos = { x: -160, y: 75 };
            widget.size = { width: 45, height: 45 };
            widget.setOpenAction(this.widgetClick.bind(this));
            widget.actions['open'] = tmc.ui.addAction(this.toggleWidget.bind(this), 1);
            widget.actions['close'] = tmc.ui.addAction(this.toggleWidget.bind(this), -1);
            widget.setData({ open: true });
        }

        let outLeaderboard = this.leaderboard.slice(0, 5);
        let myIndex = this.leaderboard.findIndex((p) => p.login == login);

        let addLeaderboard = true;
        if (myIndex !== -1) {
            if (myIndex >= 10) {
                addLeaderboard = false;
                outLeaderboard = [...outLeaderboard, ...this.leaderboard.slice(myIndex - 3, myIndex + 2)];
            }
        }

        if (addLeaderboard) {
            outLeaderboard = [...outLeaderboard, ...this.leaderboard.slice(5, 10)];
        }

        for (const rank of outLeaderboard) {
            rank.nickname = htmlEntities(rank.player?.nickname ?? (await tmc.getPlayer(rank.login)).nickname);
        }

        widget.setData({ ...widget.data, leaderboard: outLeaderboard });
        widget.size = { width: 45, height: 4 * outLeaderboard.length + 1 };

        this.widgets[login] = widget;
    }

    async widgetClick(login: string) {
        await tmc.chatCmd.execute(login, "/leaderboard");
    }
}
