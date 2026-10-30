"""In-memory stand-ins for the DynamoDB table, S3 and SES clients the mail Lambda uses.

They implement exactly the call shapes `store.py` and `inbound.py` make, and refuse anything
else loudly, so a new call shape in the code fails a test instead of passing silently."""

import io
import re


class ConditionalCheckFailed(Exception):
    """Raised like botocore's ClientError: `.response["Error"]["Code"]`."""

    def __init__(self):
        super().__init__("ConditionalCheckFailedException")
        self.response = {"Error": {"Code": "ConditionalCheckFailedException"}}


class FakeClientError(Exception):
    def __init__(self, code, message="refused"):
        super().__init__(f"An error occurred ({code}) when calling the SendEmail operation: {message}")
        self.response = {"Error": {"Code": code, "Message": message}}


class FakeTable:
    def __init__(self):
        self.items = {}
        self.indexes = {"by-id": "message_id"}

    def seed(self, item):
        self.items[(item["pk"], item["sk"])] = dict(item)

    # -- reads ---------------------------------------------------------------------------------
    def get_item(self, Key, ConsistentRead=False):
        item = self.items.get((Key["pk"], Key["sk"]))
        return {"Item": dict(item)} if item else {}

    def query(self, KeyConditionExpression, ExpressionAttributeValues, IndexName=None, **kw):
        m = re.fullmatch(r"(\w+) = (:\w+)(?: AND sk >= (:\w+))?", KeyConditionExpression)
        assert m, f"unsupported KeyConditionExpression {KeyConditionExpression!r}"
        attr, value, since = m.group(1), ExpressionAttributeValues[m.group(2)], m.group(3)
        if IndexName:
            assert attr == self.indexes[IndexName], (IndexName, attr)
        rows = [dict(i) for i in self.items.values() if i.get(attr) == value]
        if since:
            rows = [r for r in rows if r["sk"] >= ExpressionAttributeValues[since]]
        rows.sort(key=lambda r: r["sk"], reverse=not kw.get("ScanIndexForward", True))
        if "Limit" in kw:
            rows = rows[: kw["Limit"]]
        return {"Items": rows}

    # -- writes --------------------------------------------------------------------------------
    def put_item(self, Item, ConditionExpression=None):
        key = (Item["pk"], Item["sk"])
        if ConditionExpression is not None:
            assert ConditionExpression == "attribute_not_exists(pk)", ConditionExpression
            if key in self.items:
                raise ConditionalCheckFailed()
        self.items[key] = dict(Item)
        return {}

    def delete_item(self, Key):
        self.items.pop((Key["pk"], Key["sk"]), None)
        return {}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues=None, ExpressionAttributeNames=None,
                    ConditionExpression=None, ReturnValues=None):
        names = ExpressionAttributeNames or {}
        values = ExpressionAttributeValues or {}
        key = (Key["pk"], Key["sk"])
        if ConditionExpression is not None:
            assert ConditionExpression == "attribute_exists(pk)", ConditionExpression
            if key not in self.items:
                raise ConditionalCheckFailed()
        item = self.items.setdefault(key, {"pk": Key["pk"], "sk": Key["sk"]})
        for clause, body in re.findall(r"(SET|ADD|REMOVE) (.*?)(?= (?:SET|ADD|REMOVE) |$)", UpdateExpression):
            for part in [p.strip() for p in body.split(",") if p.strip()]:
                if clause == "SET":
                    attr, value = [x.strip() for x in part.split("=", 1)]
                    item[names.get(attr, attr)] = values[value]
                elif clause == "ADD":
                    attr, value = part.split()
                    attr = names.get(attr, attr)
                    item[attr] = item.get(attr, 0) + values[value]
                else:
                    item.pop(names.get(part, part), None)
        return {"Attributes": dict(item)} if ReturnValues == "ALL_NEW" else {}


class FakeS3:
    def __init__(self):
        self.objects = {}

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise FakeClientError("NoSuchKey")
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, Bucket, Key, Body, **kw):
        self.objects[Key] = bytes(Body)
        return {}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)
        return {}


class FakeSES:
    """sesv2: records send_email calls; `fail_with(code)` makes the next sends raise."""

    def __init__(self):
        self.calls = []
        self.message_ids = []
        self._fail = None

    def fail_with(self, code, message="refused"):
        self._fail = (code, message) if code else None

    def send_email(self, **kw):
        if self._fail:
            raise FakeClientError(*self._fail)
        self.calls.append(kw)
        mid = f"0100019a-ses-{len(self.message_ids) + 1:04d}"
        self.message_ids.append(mid)
        return {"MessageId": mid}
