"""MT5 sidecar: official MetaTrader5 function names over stdin/stdout JSON."""

from __future__ import annotations

from datetime import datetime
import json
import sys
import traceback

import MetaTrader5 as mt5

TRADE_REQUEST_KEYS = (
    "action",
    "magic",
    "order",
    "symbol",
    "volume",
    "price",
    "stoplimit",
    "sl",
    "tp",
    "deviation",
    "type",
    "type_filling",
    "type_time",
    "expiration",
    "comment",
    "position",
    "position_by",
)

# MetaTrader5 C API rejects int/0 for price fields: (-2, 'Invalid "sl" argument')
TRADE_FLOAT_KEYS = ("volume", "price", "stoplimit", "sl", "tp")


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def ok(req_id, data):
    return {"id": req_id, "ok": True, "data": data}


def err(req_id, message: str):
    return {"id": req_id, "ok": False, "error": message}


def to_jsonable(obj):
    if obj is None:
        return None
    if hasattr(obj, "_asdict"):
        return {k: to_jsonable(v) for k, v in obj._asdict().items()}
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(x) for x in obj]
    if isinstance(obj, (str, int, float, bool)):
        return obj
    return str(obj)


def last_error_text() -> str:
    return str(mt5.last_error())


def require(payload: dict, key: str):
    value = payload.get(key)
    if value is None or value == "":
        raise RuntimeError(f"{key} is required")
    return value


def rows(value, name: str):
    if value is None:
        raise RuntimeError(f"{name} failed: {last_error_text()}")
    return [to_jsonable(x) for x in value]


def trade_filter(payload: dict) -> dict:
    out = {}
    if payload.get("symbol"):
        out["symbol"] = payload["symbol"]
    if payload.get("group"):
        out["group"] = payload["group"]
    if payload.get("ticket") is not None:
        out["ticket"] = int(payload["ticket"])
    return out


TIMEFRAMES = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}


def rates_to_rows(rates) -> list:
    if rates is None:
        return []
    out = []
    names = getattr(getattr(rates, "dtype", None), "names", None) or ()
    for row in rates:
        if names:
            item = {name: row[name] for name in names}
        elif hasattr(row, "_asdict"):
            item = row._asdict()
        else:
            item = {
                "time": row[0],
                "open": row[1],
                "high": row[2],
                "low": row[3],
                "close": row[4],
                "tick_volume": row[5],
                "spread": row[6] if len(row) > 6 else 0,
            }
        t = int(item.get("time") or 0)
        out.append(
            {
                "time": t * 1000 if t < 10_000_000_000 else t,
                "open": float(item.get("open") or 0),
                "high": float(item.get("high") or 0),
                "low": float(item.get("low") or 0),
                "close": float(item.get("close") or 0),
                "tick_volume": int(item.get("tick_volume") or 0),
                "spread": int(item.get("spread") or 0),
            }
        )
    return out


def to_dt(value) -> datetime:
    ts = float(value)
    if ts > 10_000_000_000:
        ts /= 1000.0
    return datetime.fromtimestamp(ts)


def deals_to_rows(deals) -> list:
    if deals is None:
        return []
    names = getattr(getattr(deals, "dtype", None), "names", None) or ()
    out = []
    for row in deals:
        if names:
            item = {name: row[name] for name in names}
        elif hasattr(row, "_asdict"):
            item = row._asdict()
        else:
            continue
        t = int(item.get("time") or 0)
        out.append(
            {
                "ticket": int(item.get("ticket") or 0),
                "order": int(item.get("order") or 0),
                "time": t * 1000 if t < 10_000_000_000 else t,
                "type": int(item.get("type") or 0),
                "entry": int(item.get("entry") or 0),
                "magic": int(item.get("magic") or 0),
                "position_id": int(item.get("position_id") or 0),
                "volume": float(item.get("volume") or 0),
                "price": float(item.get("price") or 0),
                "commission": float(item.get("commission") or 0),
                "swap": float(item.get("swap") or 0),
                "profit": float(item.get("profit") or 0),
                "fee": float(item.get("fee") or 0),
                "symbol": str(item.get("symbol") or ""),
                "comment": str(item.get("comment") or ""),
            }
        )
    return out


def trade_request(payload: dict) -> dict:
    request = {}
    for key in TRADE_REQUEST_KEYS:
        if key not in payload or payload[key] is None:
            continue
        value = payload[key]
        if key in TRADE_FLOAT_KEYS:
            try:
                value = float(value)
            except (TypeError, ValueError) as exc:
                raise RuntimeError(f"invalid {key}: {value!r}") from exc
            # 0 means "no stop" in MQL5, but the Python wrapper treats it as invalid
            if key in ("sl", "tp", "stoplimit") and value <= 0:
                continue
        request[key] = value
    if "action" not in request:
        raise RuntimeError("action is required")
    return request


def handle(req: dict):
    action = req.get("action")
    payload = req.get("payload") or {}

    if action == "version":
        return to_jsonable(mt5.version())

    if action == "last_error":
        return to_jsonable(mt5.last_error())

    if action == "account_info":
        return to_jsonable(mt5.account_info())

    if action == "terminal_info":
        return to_jsonable(mt5.terminal_info())

    if action == "symbols_total":
        return mt5.symbols_total()

    if action == "symbols_get":
        group = payload.get("group")
        result = mt5.symbols_get(group) if group else mt5.symbols_get()
        return rows(result, "symbols_get")

    if action == "symbol_info":
        return to_jsonable(mt5.symbol_info(require(payload, "symbol")))

    if action == "symbol_info_tick":
        return to_jsonable(mt5.symbol_info_tick(require(payload, "symbol")))

    if action == "symbol_select":
        symbol = require(payload, "symbol")
        enable = payload.get("enable", True)
        return bool(mt5.symbol_select(symbol, bool(enable)))

    if action == "copy_rates_from_pos":
        symbol = require(payload, "symbol")
        tf_name = str(payload.get("timeframe") or "H1").upper()
        tf = TIMEFRAMES.get(tf_name)
        if tf is None:
            raise RuntimeError(f"invalid timeframe: {tf_name}")
        start = int(payload.get("start") or 0)
        count = int(payload.get("count") or 220)
        if count < 1 or count > 5000:
            raise RuntimeError("invalid count")
        rates = mt5.copy_rates_from_pos(symbol, tf, start, count)
        return rates_to_rows(rates)

    if action == "history_deals_get":
        if payload.get("date_from") is None or payload.get("date_to") is None:
            raise RuntimeError("date_from and date_to are required")
        dt_from = to_dt(payload.get("date_from"))
        dt_to = to_dt(payload.get("date_to"))
        group = payload.get("group")
        if group:
            deals = mt5.history_deals_get(dt_from, dt_to, group=group)
        else:
            deals = mt5.history_deals_get(dt_from, dt_to)
        return deals_to_rows(deals)

    if action == "positions_total":
        return mt5.positions_total()

    if action == "positions_get":
        return rows(mt5.positions_get(**trade_filter(payload)), "positions_get")

    if action == "orders_total":
        return mt5.orders_total()

    if action == "orders_get":
        return rows(mt5.orders_get(**trade_filter(payload)), "orders_get")

    if action == "order_check":
        result = mt5.order_check(trade_request(payload))
        if result is None:
            raise RuntimeError(f"order_check failed: {last_error_text()}")
        return to_jsonable(result)

    if action == "order_send":
        result = mt5.order_send(trade_request(payload))
        if result is None:
            raise RuntimeError(f"order_send failed: {last_error_text()}")
        return to_jsonable(result)

    raise RuntimeError(f"unknown action: {action}")


def write(payload: dict) -> None:
    print(json.dumps(payload, default=str), flush=True)


def main() -> int:
    if not mt5.initialize():
        write(err(None, f"mt5.initialize failed: {last_error_text()}"))
        return 1

    log("mt5.initialize ok")
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except json.JSONDecodeError as exc:
                write(err(None, f"invalid json: {exc}"))
                continue
            req_id = req.get("id")
            try:
                write(ok(req_id, handle(req)))
            except Exception as exc:
                log(traceback.format_exc())
                write(err(req_id, str(exc)))
    finally:
        mt5.shutdown()
        log("mt5.shutdown")
    return 0


if __name__ == "__main__":
    sys.exit(main())
