import Widget from 'core/ui/widget';
import Plugin from 'core/plugins';
import tm from 'tm-essentials';

export default class TAlimitPlugin extends Plugin {
    depends: string[] = ["game:TmForever"];
    startTime: number = Date.now();
    timeLimit: number = 0;
    active: boolean = false;
    extend: boolean = false;
    widget: Widget | null = null;
    intervalId: NodeJS.Timeout | null = null;

    async onBeginRound() {
        this.startTime = Date.now();
        const gamemode = await tmc.server.call("GetGameMode"); // Rounds (0), TimeAttack (1), Team (2), Laps (3), Stunts (4) and Cup (5)
        this.active = false;
        if (gamemode === 1) {
            this.active = true;
        }
        if (this.extend) {
            this.extend = false;
            this.timeLimit = Number.parseInt(process.env.TALIMIT || "300");
        }
    }

    async onEndRound() {
        this.active = false;
        await this.hideWidget();
    }

    async onLoad() {
        this.widget = new Widget("plugins/tmnf_talimit/widget.twig");
        this.widget.pos = { x: 139, y: -40 };
        this.timeLimit = Number.parseInt(process.env.TALIMIT || "300");
        this.startTime = Date.now();
        tmc.server.addListener("Trackmania.BeginRound", this.onBeginRound, this);
        tmc.server.addListener("Trackmania.EndRound", this.onEndRound, this);
        const gamemode = await tmc.server.call("GetGameMode"); // Rounds (0), TimeAttack (1), Team (2), Laps (3), Stunts (4) and Cup (5)
        if (gamemode === 1) {
            const limit = await tmc.server.call("GetTimeAttackLimit");
            if (limit.CurrentValue > 0) {
                await tmc.server.send("SetTimeAttackLimit", 0);
                await tmc.chat("TALimit: TimeAttackLimit was set, disabling it.");
                tmc.server.send("NextMap");
            }
            this.active = true;
        }
        tmc.server.addOverride("SetTimeAttackLimit", this.overrideSetLimit.bind(this));
        this.intervalId = setInterval(() => this.tick(), 1000);
    }

    async onUnload() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        tmc.server.removeOverride("SetTimeAttackLimit");
        tmc.server.removeListener("Trackmania.BeginRound", this.onBeginRound.bind(this));
        tmc.server.removeListener("Trackmania.EndRound", this.onEndRound.bind(this));
        this.active = false;
        await this.hideWidget();
    }

    async tick() {
        if (this.timeLimit < 1) {
            return;
        }
        const timeLeft = 3 + this.timeLimit - (Date.now() - this.startTime) / 1000;
        if (this.active && timeLeft <= 0) {
            this.active = false;
            tmc.server.send("NextMap");
        } else if (this.active) {
            this.showWidget();
        }
    }

    async overrideSetLimit(args: string) {
        const newlimit = Number.parseInt(args) / 1000;
        process.env["TALIMIT"] = newlimit.toString();
        this.timeLimit = newlimit;
        this.hideWidget();
    }

    async showWidget() {
        let color = "$fff";
        const timeLeft = 3 + this.timeLimit - (Date.now() - this.startTime) / 1000;
        if (timeLeft < 60) color = "$ff0";
        if (timeLeft < 30) color = "$f00";
        let time = tm.Time.fromSeconds(timeLeft).toTmString(true).replace(/\.\d\d/, "");

        if (this.widget) {
            this.widget.setData({
                time: `${color}$s${time}`,
            });
            await this.widget.display();
        }

    }

    async hideWidget() {
        await this.widget?.hide();
    }
}