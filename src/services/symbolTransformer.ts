
export function getMStockSymbol(underlying: string, expiryStr: string, strike: number, optionType: 'CE' | 'PE'): string {
    let u = underlying.toUpperCase().replace(/\s+/g, "");
    if (["NIFTY50", "NIFTY", "NIFTY 50"].includes(u)) u = "NIFTY";
    else if (u.includes("BANKNIFTY")) u = "BANKNIFTY";
    else if (u.includes("FINNIFTY")) u = "FINNIFTY";
    else if (u.includes("MIDCP") || u === "MIDCPNIFTY") u = "MIDCPNIFTY";
    else if (u.includes("NIFTYNEXT") || u.includes("NEXT50")) u = "NIFTYNXT50";
    else if (u === "SENSEX") u = "SENSEX";
    else if (u === "BANKEX") u = "BANKEX";

    const expiry = new Date(expiryStr);
    const yy = expiry.getFullYear().toString().slice(-2);
    const month = expiry.getMonth() + 1; // 1-indexed
    const day = expiry.getDate();

    // Target weekdays (0 = Sunday, 1 = Monday ...)
    let targetWeekday = 4; // Thursday (Wait, standard was 3 in python? Let's check: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun)
    // Python datetime.weekday(): 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
    // JS Date.getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

    // JS map (Python 0-6 to JS 0-6)
    // Python 0 (Mon) -> JS 1
    // Python 1 (Tue) -> JS 2
    // Python 2 (Wed) -> JS 3
    // Python 3 (Thu) -> JS 4
    // Python 4 (Fri) -> JS 5
    // Python 5 (Sat) -> JS 6
    // Python 6 (Sun) -> JS 0

    let jsTargetWeekday = 4; // Thursday (Python 3)
    if (u === "BANKNIFTY") jsTargetWeekday = 3;  // Wednesday (Python 2)
    else if (u === "FINNIFTY") jsTargetWeekday = 2; // Tuesday (Python 1)
    else if (["MIDCPNIFTY", "BANKEX"].includes(u)) jsTargetWeekday = 1; // Monday (Python 0)
    else if (u === "SENSEX") jsTargetWeekday = 5; // Friday (Python 4)

    const year = expiry.getFullYear();
    const monthIdx = expiry.getMonth(); // 0-indexed
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    
    let lastTargetDate = 0;
    for (let d = lastDay; d > 0; d--) {
        if (new Date(year, monthIdx, d).getDay() === jsTargetWeekday) {
            lastTargetDate = d;
            break;
        }
    }

    const isMonthly = (lastTargetDate - 3) <= day && day <= lastTargetDate;

    if (isMonthly) {
        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const mmm = months[monthIdx];
        return `${u}${yy}${mmm}${Math.floor(strike)}${optionType}`;
    } else {
        let m = month.toString();
        if (month === 10) m = "O";
        else if (month === 11) m = "N";
        else if (month === 12) m = "D";

        const dd = day.toString().padStart(2, '0');
        return `${u}${yy}${m}${dd}${Math.floor(strike)}${optionType}`;
    }
}

export function getDhanHumanSymbol(underlying: string, expiryStr: string, strike: number, optionType: 'CE' | 'PE'): string {
    const expiry = new Date(expiryStr);
    const day = expiry.getDate().toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[expiry.getMonth()];
    return `${underlying} ${day} ${month} ${Math.floor(strike)} ${optionType}`;
}
