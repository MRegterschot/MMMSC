import type { Player } from "../../../../../../core/playermanager";
import Plugin from "../../../../../../core/plugins";
import Widget from "../../../../../../core/ui/widget";

export default class MMMRecordsWidget extends Plugin {
    static depends: string[] = ["mmm/leaderboard"];
    widgets: { [key: string]: Widget } = {};
    records: any[] = [];

    async onLoad() {
        tmc.server.addListener("TMC.PlayerConnect", this.onPlayerConnect, this);
        tmc.server.addListener("TMC.PlayerDisconnect", this.onPlayerDisconnect, this);
        tmc.server.addListener("Plugin.MMMRecords.onSync", this.onSync, this);
        tmc.server.addListener("Plugin.MMMRecords.onRefresh", this.onSync, this);
        tmc.server.addListener("Plugin.MMMRecords.onUpdateRecord", this.onUpdateRecord, this);
        tmc.server.addListener("Plugin.MMMRecords.onNewRecord", this.onNewRecord, this);
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
        tmc.server.removeListener("Plugin.MMMRecords.onSync", this.onSync);
        tmc.server.removeListener("Plugin.MMMRecords.onRefresh", this.onSync);
        tmc.server.removeListener("Plugin.MMMRecords.onUpdateRecord", this.onUpdateRecord);
        tmc.server.removeListener("Plugin.MMMRecords.onNewRecord", this.onNewRecord);
    }

    async onSync(data: any) {
        this.records = data.records;
        await this.updateWidgets();
    }

    async onNewRecord(data: any) {
        this.records = data.records;
        await this.updateWidgets();
    }

    async onUpdateRecord(data: any) {
        this.records = data.records;
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
            this.widgets[login].pos = { x: 105, y: 30, z: 10 };
            this.widgets[login].setData({ ...this.widgets[login].data, open: true });
        } else {
            this.widgets[login].pos = { x: 160, y: 30, z: 10 };
            this.widgets[login].setData({ ...this.widgets[login].data, open: false });
        }

        await tmc.ui.displayManialink(this.widgets[login]);
    }

    async updateWidget(login: string) {
        let widget = this.widgets[login];
        if (!widget) {
            widget = new Widget("userdata/plugins/mmm/leaderboard/widgets/records/widget.twig");
            widget.title = "Records";
            widget.recipient = login;
            widget.pos = { x: 105, y: 30, z: 10 };
            widget.size = { width: 55, height: 45 };
            widget.setOpenAction(this.widgetClick.bind(this));
            widget.actions['open'] = tmc.ui.addAction(this.toggleWidget.bind(this), 1);
            widget.actions['close'] = tmc.ui.addAction(this.toggleWidget.bind(this), -1);
            widget.setData({ open: true });
        }

        let outRecords = this.records.slice(0, 5);
        let myIndex = this.records.findIndex((val: any) => val.login == login);

        let addRecords = true;
        if (myIndex !== -1) {
            if (myIndex >= 10) {
                addRecords = false;
                outRecords = [...outRecords, ...this.records.slice(myIndex - 3, myIndex + 2)];
            }
        }
        if (addRecords) {
            outRecords = [...outRecords, ...this.records.slice(5, 10)];
        }

        widget.setData({ ...widget.data, records: outRecords });
        widget.size = { width: 55, height: 4 * outRecords.length + 1 };

        this.widgets[login] = widget;
    }

    async widgetClick(login: string, data: any) {
        await tmc.chatCmd.execute(login, "/points");
    }
}
