export interface TokenInfo {
    client_id: string;
    expiry: string;
    is_expired: boolean;
    seconds_left: number;
}

export const decodeDhanToken = (token: string): TokenInfo | null => {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const payload = JSON.parse(atob(parts[1]));
        const exp = payload.exp;
        const clientId = payload.dhanClientId;
        
        const expiryDate = new Date(exp * 1000);
        const now = new Date();
        const secondsLeft = Math.floor((expiryDate.getTime() - now.getTime()) / 1000);
        
        return {
            client_id: clientId,
            expiry: expiryDate.toLocaleString(),
            is_expired: now > expiryDate,
            seconds_left: secondsLeft
        };
    } catch (e) {
        console.error("Token Decode Error:", e);
        return null;
    }
};
