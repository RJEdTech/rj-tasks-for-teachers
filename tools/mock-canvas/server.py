"""
Mock rjhs.instructure.com for a TEACHER, to test RJ Tasks for Teachers without
real student data. All names are made up. Dates are relative to "now" in
America/Denver so every check-up rule and the week view always have data.

Run:  python3 -I server.py [port]     (default 8444, HTTPS with cert.pem/key.pem)
Browser: --host-resolver-rules="MAP rjhs.instructure.com:443 127.0.0.1:8444"
GET /__as_student switches the session to a student (no classes taught).
Any non-GET request is recorded and answered 405; GET /__writes lists them.
"""
import json
import ssl
import sys
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8444
HERE = __file__.rsplit("/", 1)[0]
TZ = ZoneInfo("America/Denver")
WRITES = []
API_COUNT = [0]


def now():
    return datetime.now(TZ)


def day(offset, h=23, m=59):
    d = (now() + timedelta(days=offset)).replace(hour=h, minute=m, second=0, microsecond=0)
    return d.isoformat()


def assignments_for(cid):
    A = lambda i, name, due, **kw: {
        "id": str(i), "name": name, "course_id": cid, "published": kw.get("published", True),
        "due_at": due, "lock_at": kw.get("lock_at"), "unlock_at": None,
        "all_dates": kw.get("all_dates") or [{"base": True, "due_at": due, "lock_at": kw.get("lock_at")}],
        "points_possible": kw.get("points", 10), "grading_type": kw.get("gt", "points"),
        "assignment_group_id": kw.get("group", "g1"), "submission_types": ["online_upload"],
        "omit_from_final_grade": False, "needs_grading_count": kw.get("ngc", 0),
        "html_url": f"https://rjhs.instructure.com/courses/{cid}/assignments/{i}",
        **({"rubric_settings": {"points_possible": kw["rubric"]}, "use_rubric_for_grading": True} if "rubric" in kw else {}),
    }
    if cid == "101":  # ALGEBRA 1, weighted
        return [
            A(1001, "Unit 2 Test", day(-12), points=100, group="g2"),
            A(1002, "HW 2.4 Factoring", day(-9)),
            A(1003, "HW 2.5 Quadratics", day(-6)),
            A(1004, "HW 2.6 Review", day(-2)),
            A(1005, "Unit 3 Quiz", day(1, 8, 0), points=30, group="g2"),
            A(1006, "HW 3.1", day(1), rubric=8),  # rubric totals 8, assignment worth 10
            A(1007, "Exit ticket", day(2), group="g3"),  # 0% group
            A(1008, "Project proposal", None),  # no due date
            A(1009, "Unit 3 Test", day(2), published=False, points=100, group="g2"),  # unpublished, due soon
            A(1010, "HW 3.2", day(5, 0, 0)),  # 12:00 AM
            A(1011, "Warm-up log", day(3), points=0),  # 0 points
            # due next week for the class, but one student has an extension to tomorrow
            A(1012, "Essay draft", day(6), all_dates=[
                {"base": True, "due_at": day(6)},
                {"title": "1 student", "set_type": "ADHOC", "set_id": None, "due_at": day(1)},
            ]),
        ]
    if cid == "102":  # GEOMETRY, unweighted, section dates (+ a copied duplicate)
        return [
            A(2001, "Proofs worksheet", day(-4)),
            A(2002, "Lab: Triangles", day(3), lock_at=day(3, 15, 0)),  # locks before due
            A(2003, "Chapter 4 Test", day(4), points=100, all_dates=[
                {"base": False, "title": "Period 3", "set_type": "CourseSection", "set_id": "s3", "due_at": day(4)},
                {"base": False, "title": "Period 5", "set_type": "CourseSection", "set_id": "s5", "due_at": day(5)},
            ]),
            A(2004, "Ch 4 Review", day(4), all_dates=[
                {"base": False, "title": "Period 3", "set_type": "CourseSection", "set_id": "s3", "due_at": day(4)},
            ]),
            A(2005, "Reading notes", day(-1), gt="not_graded", points=None),
            A(2006, "proofs  worksheet", day(9)),  # same name as 2001
        ]
    if cid == "103":  # ADVISEMENT
        return [A(3001, "Advisement check-in", day(6), gt="not_graded", points=None)]
    return []


GROUPS = {
    "101": [{"id": "g1", "name": "Homework", "group_weight": 30},
            {"id": "g2", "name": "Tests & Quizzes", "group_weight": 60},
            {"id": "g3", "name": "Participation", "group_weight": 0}],
    "102": [{"id": "g1", "name": "Assignments", "group_weight": 0}],
    "103": [{"id": "g1", "name": "Assignments", "group_weight": 0}],
}

NAMES = ["Avery Cole", "Blake Diaz", "Casey Ellis", "Devon Ford", "Emery Grant", "Finley Hayes",
         "Gray Ito", "Harper Jones", "<img src=x onerror=alert(1)> Test", "Jordan Kim"]


def modules_for(cid):
    """101: everything but the project proposal is in a module. 102: one big
    module whose items Canvas leaves out (fetched separately). 103: none."""
    if cid == "101":
        ids = [a["id"] for a in assignments_for("101") if a["id"] != "1008"]
        return [{"id": "m1", "name": "Unit 2-3", "published": True,
                 "items": [{"id": f"i{x}", "type": "Assignment", "content_id": x, "published": True} for x in ids]}]
    if cid == "102":
        return [{"id": "m2", "name": "Chapter 4", "published": True, "items_count": 99}]
    return []


def module_items_for(cid, mid):
    if cid == "102" and mid == "m2":
        return [{"id": f"j{a['id']}", "type": "Assignment", "content_id": a["id"], "published": True} for a in assignments_for("102")]
    return []


def users_for(cid):
    base = {"101": 0, "102": 100, "103": 200}.get(cid, 900)
    return [{"id": str(9000 + base + i), "name": n, "sortable_name": ", ".join(reversed(n.split(" ", 1)))}
            for i, n in enumerate(NAMES)]


def submissions_for(cid, state, aids):
    """Canvas-like: filter by workflow_state when given, otherwise return every state."""
    users = users_for(cid)
    dropped = {"id": "9999", "name": "Dropped Student"}  # not an active enrollment
    S = lambda u, aid, st, **kw: {"id": f"{aid}-{u['id']}", "assignment_id": str(aid), "user_id": u["id"],
                                  "workflow_state": st, "submitted_at": kw.get("at"), "late": kw.get("late", False),
                                  "missing": kw.get("missing", False), "excused": kw.get("excused", False),
                                  "grade": kw.get("grade"), "grade_matches_current_submission": kw.get("gm", True),
                                  "cached_due_date": kw.get("due")}
    out = []
    if cid == "101":
        for i, u in enumerate(users[:6]):
            out.append(S(u, 1001, "submitted", at=day(-12, 14 + i % 3, 5), late=i == 5))
        for u in users[:3]:
            out.append(S(u, 1004, "submitted", at=day(-2, 20, 30)))
        out.append(S(dropped, 1004, "submitted", at=day(-3, 9, 0)))  # must not be counted
        out.append(S(users[4], 1002, "submitted", at=day(-1, 9, 0), late=True, grade="8", gm=False))
        out.append(S(users[7], 1001, "pending_review", at=day(-12, 15, 0)))
        # Casey (2) misses 3; Harper (7) misses 2 unsubmitted + 1 auto-graded by the missing policy;
        # the evil-name test student (8) misses 4; Jordan's is excused
        plan = {2: [1002, 1003, 1004], 7: [1003, 1004], 8: [1001, 1002, 1003, 1004]}
        for idx, alist in plan.items():
            for aid in alist:
                out.append(S(users[idx], aid, "unsubmitted", missing=True))
        out.append(S(users[7], 1002, "graded", missing=True, grade="0"))
        out.append(S(users[9], 1003, "unsubmitted", missing=True, excused=True))
        out.append(S(users[1], 1004, "unsubmitted", missing=False))
        out.append(S(dropped, 1003, "unsubmitted", missing=True))
    if cid == "102":
        for u in users[:4]:
            out.append(S(u, 2001, "submitted", at=day(-4, 21, 0)))
        out.append(S(users[3], 2001, "unsubmitted", missing=True))
    if state:
        out = [s for s in out if s["workflow_state"] == state]
    if aids:
        out = [s for s in out if s["assignment_id"] in aids]
    return out


def term(name, start, end):
    return {"id": name[:3], "name": name, "start_at": start, "end_at": end}


SEM_NOW = term("2026/2027 - Regis Jesuit High School - 1st Semester", day(-90, 0, 0), day(60, 0, 0))
SEM_NEXT = term("2026/2027 - Regis Jesuit High School - 2nd Semester", day(60, 0, 0), day(200, 0, 0))
OLD_SEM = term("2025/2026 - Regis Jesuit High School - 2nd Semester", day(-400, 0, 0), day(-150, 0, 0))
TERMS = {
    "pd": term("Professional Development", None, None),
    "activities": term("2026/2027 - Regis Jesuit High School - Year-Long Activities", day(-150, 0, 0), day(210, 0, 0)),
    "default": term("Default Term", None, None),
}


def courses(as_student):
    if as_student:
        return [{"id": "201", "name": "Theology 9", "course_code": "THEOLOGY 9", "workflow_state": "available",
                 "enrollments": [{"type": "student"}], "term": {"end_at": None}}]
    t = lambda i, code, name, **kw: {"id": i, "name": name, "course_code": code, "workflow_state": "available",
                                     "enrollments": [{"type": kw.get("role", "teacher")}], "end_at": kw.get("end"),
                                     "term": kw.get("term", SEM_NOW),
                                     "apply_assignment_group_weights": kw.get("weighted", False)}
    return [
        t("101", "ALGEBRA 1", "Algebra 1", weighted=True),
        t("102", "GEOMETRY", "Geometry"),
        t("103", "ADVISEMENT", "Advisement"),
        t("199", "ALGEBRA 1 (2025)", "Algebra 1 last year", term=OLD_SEM),
        dict(t("150", "SANDBOX", "Unpublished sandbox"), workflow_state="unpublished"),
        t("201", "FACULTY PD", "Faculty PD", role="student"),
        # taught, published and current, but not a semester class: left out by default
        t("301", "EDTECH PD", "Educational Technology PD", term=TERMS["pd"]),
        t("302", "RAIDERQUEST", "RaiderQuest 2026", term=TERMS["activities"]),
        t("303", "DEMO", "Demo course", term=TERMS["default"]),
        # next semester's class, already published
        t("304", "THEOLOGY 1 S2", "Theology 1 (2nd semester)", term=SEM_NEXT),
    ]


PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<style>body{{margin:0;font-family:Lato,Arial,sans-serif;background:{bg};color:{fg}}}
#header{{position:fixed;left:0;top:0;bottom:0;width:84px;background:#2a2a2a}}
#main{{margin-left:84px;margin-right:{mr}px;padding:24px 32px}}
#right-side-wrapper{{position:absolute;top:0;right:0;width:300px;padding:24px 16px}}
@media (max-width:1000px){{#right-side-wrapper{{display:none}} #main{{margin-right:0}}}}
.todo-list-header{{font-size:16px;margin:0 0 8px}} .ic-sidebar-logo{{height:40px;background:#eee;margin-bottom:16px}} .card{{display:inline-block;width:240px;height:150px;margin:0 16px 16px 0;border-radius:6px;background:{card};box-shadow:0 1px 3px rgba(0,0,0,.2);vertical-align:top}}
.hero{{height:90px;border-radius:6px 6px 0 0}} .card a{{display:block;padding:8px 12px;color:inherit;font-weight:bold}}
.sg{{position:fixed;right:0;bottom:0;left:84px;height:60px;background:#e4e7ea;border-top:1px solid #ccc;padding:16px}}
.user_content{{border:1px dashed #aaa;padding:12px;margin-top:20px}}</style></head>
<body><div id="header"></div><div id="main"><h1>{title}</h1>{body}</div>{side}</body></html>"""

# Like real Canvas: the Dashboard sidebar starts as a placeholder and is
# filled from /dashboard-sidebar after the page loads, replacing its contents.
DASH_SIDE = ('<div id="right-side-wrapper"><aside id="right-side"><div class="placeholder"></div></aside></div>'
             '<script>setTimeout(function(){fetch("/dashboard-sidebar").then(function(r){return r.text()})'
             '.then(function(t){document.getElementById("right-side").innerHTML=t})},700)</script>')
DASH_SIDE_BODY = ('<div class="ic-sidebar-logo"></div><h2 class="todo-list-header">To Do</h2>'
                  '<ul class="right-side-list to-do-list"><li>Canvas To Do item</li></ul>'
                  '<div class="events_list coming_up">Coming Up</div>')
COURSE_SIDE = ('<div id="right-side-wrapper"><aside id="right-side"><div id="course_show_secondary">'
               '<a href="#">Import Existing Content</a><a href="#">Choose Home Page</a></div>'
               '<div class="events_list coming_up">Coming Up</div></aside></div>')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def as_student(self):
        return "as=student" in (self.headers.get("Cookie") or "")

    def send(self, status, ctype, body, extra=None):
        raw = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def json(self, data, link=None):
        self.send(200, "application/json; charset=utf-8", "while(1);" + json.dumps(data),
                  {"Link": link} if link else None)

    def html(self, title, body, dark=False, extra=None, side=""):
        colors = dict(bg="#18181b" if dark else "#ffffff", fg="#e4e4e7" if dark else "#2D3B45",
                      card="#27272a" if dark else "#ffffff")
        self.send(200, "text/html; charset=utf-8",
                  PAGE.format(title=title, body=body, side=side, mr=320 if side else 0, **colors), extra)

    def do_GET(self):
        u = urlparse(self.path)
        p, q = u.path, parse_qs(u.query)
        dark = q.get("dark", ["0"])[0] == "1"
        if p == "/__as_student":
            return self.html("Student", "<p>Now a student.</p>", extra={"Set-Cookie": "as=student; Path=/; Secure"})
        if p == "/__as_teacher":
            return self.html("Teacher", "<p>Now a teacher.</p>",
                             extra={"Set-Cookie": "as=; Path=/; Secure; Max-Age=0"})
        if p == "/dashboard-sidebar":
            return self.send(200, "text/html; charset=utf-8", DASH_SIDE_BODY)
        if p == "/__api_count":
            return self.json({"n": API_COUNT[0]})
        if p == "/__writes":
            return self.json(WRITES)
        if p == "/":
            cards = "".join(f'<div class="card"><div class="hero" style="background:{c}"></div><a href="/courses/{i}">{n}</a></div>'
                            for i, n, c in [("101", "Algebra 1", "#0B6E4F"), ("102", "Geometry", "#1D4ED8"), ("103", "Advisement", "#7A1F2B")])
            return self.html("Dashboard", cards, dark, side=DASH_SIDE)
        if p.startswith("/courses/") and "/gradebook" in p:
            return self.html("SpeedGrader", '<div class="sg">SpeedGrader controls</div>', dark)
        if p == "/planted":
            fake = ('<div class="user_content"><p>Teacher-written page content:</p>'
                    '<button data-rjtt>My Classes</button><div class="panel">Fake panel</div></div>')
            return self.html("Course page with planted content", fake, dark)
        if p.startswith("/courses/") and not p.startswith("/api"):
            home = len([x for x in p.split("/") if x]) == 2
            return self.html("Course", "<p>Course page</p>", dark, side=COURSE_SIDE if home else "")

        if p.startswith("/api/v1/courses/"):
            API_COUNT[0] += 1
        if p == "/api/v1/courses":
            return self.json(courses(self.as_student()))
        if p == "/api/v1/users/self/todo_item_count":
            return self.json({"needs_grading_count": 0 if self.as_student() else 4, "assignments_needing_submitting": 0})
        parts = p.split("/")
        if p.startswith("/api/v1/courses/") and len(parts) >= 6:
            cid, rest = parts[4], "/".join(parts[5:])
            if rest == "assignments":
                return self.json(assignments_for(cid))
            if rest == "modules":
                return self.json(modules_for(cid))
            if rest.startswith("modules/") and rest.endswith("/items"):
                return self.json(module_items_for(cid, rest.split("/")[1]))
            if rest == "late_policy":
                if cid == "103":
                    return self.send(404, "application/json", "while(1);" + json.dumps({"errors": [{"message": "not found"}]}))
                return self.json({"late_policy": {"missing_submission_deduction_enabled": cid == "101", "late_submission_deduction_enabled": False}})
            if rest == "assignment_groups":
                return self.json(GROUPS.get(cid, []))
            if rest == "users":
                return self.json(users_for(cid))
            if rest == "grading_periods":
                if cid == "101":
                    return self.json({"grading_periods": [
                        {"id": "q1", "title": "Q1", "start_date": day(-80, 0, 0), "end_date": day(-30, 0, 0)},
                        {"id": "q2", "title": "Q2", "start_date": day(-30, 0, 0), "end_date": day(50, 0, 0)}]})
                return self.json({"grading_periods": []})
            if rest == "students/submissions":
                state = q.get("workflow_state", [""])[0]
                aids = set(q.get("assignment_ids[]", []))
                return self.json(submissions_for(cid, state, aids))
        self.send(404, "application/json", "while(1);" + json.dumps({"errors": [{"message": "not found"}]}))

    def refuse(self):
        WRITES.append(f"{self.command} {self.path}")
        self.send(405, "application/json", "{}")

    do_POST = do_PUT = do_PATCH = do_DELETE = refuse


ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(f"{HERE}/cert.pem", f"{HERE}/key.pem")
srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print(f"mock teacher Canvas on https://127.0.0.1:{PORT}", flush=True)
srv.serve_forever()
