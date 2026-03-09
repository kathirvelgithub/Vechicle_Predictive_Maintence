import database


def test_insert_supports_direct_result_access(monkeypatch):
    def fake_execute_query(query, params=None, fetch=True):
        return [{"vehicle_id": "V-301", "title": "Alert"}]

    monkeypatch.setattr(database, "execute_query", fake_execute_query)

    result = database.SimpleDB().table("notifications").insert({
        "vehicle_id": "V-301",
        "title": "Alert",
    })

    assert result["data"][0]["vehicle_id"] == "V-301"


def test_update_supports_eq_then_execute(monkeypatch):
    captured = {}

    def fake_execute_query(query, params=None, fetch=True):
        captured["query"] = query
        captured["params"] = params
        return [{"vehicle_id": "V-301", "status": "scheduled"}]

    monkeypatch.setattr(database, "execute_query", fake_execute_query)

    result = database.SimpleDB().table("vehicles").update({
        "status": "scheduled",
    }).eq("vehicle_id", "V-301").execute()

    assert "UPDATE vehicles SET status = %s WHERE vehicle_id = 'V-301' RETURNING *" == captured["query"]
    assert captured["params"] == ("scheduled",)
    assert result["data"][0]["status"] == "scheduled"