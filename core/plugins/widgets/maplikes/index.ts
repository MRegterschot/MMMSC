import Plugin from '@core/plugins';
import type { Like } from '@core/plugins/maplikes';
import MapLikes from '@core/plugins/maplikes';
import Widget from '@core/ui/widget';
import type { Player } from '../../../playermanager';

export default class MapLikesWidget extends Plugin {
    static depends: string[] = ['database', 'maplikes'];
    widgets: { [key: string]: Widget } = {};
    mapLikes: Like[] = [];

    async onLoad() {
        tmc.server.addListener('TMC.PlayerConnect', this.onPlayerConnect, this);
        tmc.server.addListener('TMC.PlayerDisconnect', this.onPlayerDisconnect, this);
        tmc.server.addListener('Plugin.MapLikes.onSync', this.onSync, this);
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

    async actionLike(login: string, value: number) {
        if (value > 0) (tmc.plugins['maplikes'] as MapLikes)?.updateVote(login, 1);
        else (tmc.plugins['maplikes'] as MapLikes)?.updateVote(login, -1);
    }

    async onUnload() {
        for (const login of Object.keys(this.widgets)) {
            delete this.widgets[login];
        }
        tmc.server.addListener('TMC.PlayerConnect', this.onPlayerConnect, this);
        tmc.server.addListener('TMC.PlayerDisconnect', this.onPlayerDisconnect, this);
        tmc.server.removeListener('Plugin.MapLikes.onSync', this.onSync);
    }

    async onSync(data: Like[]) {
        this.mapLikes = data;
        await this.updateWidgets();
    }

    async updateWidgets() {
        for (const player of tmc.players.getAll()) {
            await this.updateWidget(player.login);
        }
        await tmc.ui.displayManialinks(Object.values(this.widgets));
    }

    async updateWidget(login: string) {
        let widget = this.widgets[login];

        if (!widget) {
            widget = new Widget('core/plugins/widgets/maplikes/widget.xml.twig');
            widget.pos = { x: 115, y: 60, z: 10 };
            widget.recipient = login;
            widget.actions['like'] = tmc.ui.addAction(this.actionLike.bind(this), 1);
            widget.actions['dislike'] = tmc.ui.addAction(this.actionLike.bind(this), -1);
        }

        let positive = 0;
        let negative = 0;
        let total = this.mapLikes.length;
        let wording = 'Neutral';

        for (const like of this.mapLikes) {
            if (like.vote > 0) {
                positive++;
            } else {
                negative++;
            }
        }

        let percentage = (((positive / total) * 100).toFixed(0) || 0) + '%';
        const percent = (positive / total) * 100;

        if (percent < 40) wording = 'Not Fun';
        if (percent > 50) wording = 'Fun';
        if (percent > 60) wording = 'Super Fun';
        if (total <= 0) {
            percentage = 'No Votes';
            wording = 'Neutral';
        }

        widget.size = { width: 45, height: 6 };
        widget.setData({
            percentage: percentage,
            wording: wording,
            positive: positive,
            negative: negative,
            mapLike: this.mapLikes.find((like) => like.login === login),
            width: ((positive / total) * (widget.size.width - 12)).toFixed(0),
        });

        widget.title = 'Map Likes [' + this.mapLikes.length + ']';

        this.widgets[login] = widget;
    }
}
