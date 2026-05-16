
import axios from "axios";

export class MStockClient {
    private apiKey: string;
    public access_token: string | null = null;
    private userId: string | null = null;
    private password: string | null = null;
    private baseUrl = "https://api.mstock.trade/openapi/typea";

    constructor(apiKey: string = '', userId: string = '', password: string = '') {
        this.apiKey = apiKey;
        this.userId = userId;
        this.password = password;
    }

    private get headers() {
        return {
            "X-Mirae-Version": "1",
            "Authorization": `token ${this.apiKey}:${this.access_token}`,
        };
    }

    private get headersForm() {
        return {
            ...this.headers,
            "Content-Type": "application/x-www-form-urlencoded"
        };
    }

    async loginStep1() {
        try {
            const params = new URLSearchParams();
            params.append('username', this.userId || '');
            params.append('password', this.password || '');

            const response = await axios.post(`${this.baseUrl}/connect/login`, params, {
                headers: { "X-Mirae-Version": "1", "Content-Type": "application/x-www-form-urlencoded" }
            });
            return response.data;
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    }

    async verifyTotp(totp: string) {
        try {
            const params = new URLSearchParams();
            params.append('api_key', this.apiKey);
            params.append('totp', totp);

            const response = await axios.post(`${this.baseUrl}/session/verifytotp`, params, {
                headers: { "X-Mirae-Version": "1", "Content-Type": "application/x-www-form-urlencoded" }
            });
            if (response.data?.status === 'success') {
                this.access_token = response.data.data.access_token;
            }
            return response.data;
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    }

    private detectExchange(symbol: string): string {
        const up = symbol.toUpperCase();
        const bfo = ["SENSEX", "BANKEX"];
        const nfo = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"];
        if (bfo.some(s => up.includes(s))) return "BFO";
        if (nfo.some(s => up.includes(s))) return "NFO";
        return "NSE";
    }

    async placeOrder(params: {
        symbol: string,
        qty: number,
        side: string,
        price?: number,
        trigger_price?: number,
        order_type?: string,
        exchange?: string,
        product?: string
    }) {
        if (!this.access_token) return { status: "error", message: "Not authenticated" };

        const exchange = params.exchange || this.detectExchange(params.symbol);
        const product = params.product || "MIS";

        const body = new URLSearchParams();
        body.append('tradingsymbol', params.symbol);
        body.append('exchange', exchange);
        body.append('transaction_type', params.side.toUpperCase());
        body.append('quantity', params.qty.toString());
        body.append('price', (params.price || 0).toString());
        body.append('trigger_price', (params.trigger_price || 0).toString());
        body.append('product', product);
        body.append('order_type', (params.order_type || "MARKET").toUpperCase());
        body.append('validity', "DAY");
        body.append('disclosed_quantity', "0");

        try {
            const response = await axios.post(`${this.baseUrl}/orders/regular`, body, {
                headers: this.headersForm
            });
            return response.data;
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    }

    async getOrderBook() {
        if (!this.access_token) return [];
        try {
            const response = await axios.get(`${this.baseUrl}/orders`, { headers: this.headers });
            if (response.data?.status === 'success') return response.data.data;
            return [];
        } catch (e) {
            return [];
        }
    }

    async cancelOrder(orderId: string) {
        if (!this.access_token) return { status: "error", message: "Not authenticated" };
        try {
            const response = await axios.delete(`${this.baseUrl}/orders/regular/${orderId}`, { headers: this.headers });
            return response.data;
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    }

    async getFunds() {
        if (!this.access_token) return 0;
        try {
            const response = await axios.get(`${this.baseUrl}/funds/limit`, { headers: this.headers });
            if (response.data?.status === 'success') {
                return parseFloat(response.data.data?.equity?.available?.cash || 0);
            }
            return 0;
        } catch (e) {
            return 0;
        }
    }

    async getPositions() {
        if (!this.access_token) return [];
        try {
            const response = await axios.get(`${this.baseUrl}/portfolio/positions`, { headers: this.headers });
            if (response.data?.status === 'success') return response.data.data;
            return [];
        } catch (e) {
            return [];
        }
    }
}
