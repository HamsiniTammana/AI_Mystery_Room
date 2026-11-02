import streamlit as st
from datetime import datetime

st.set_page_config(page_title="AI Mystery Room", page_icon="🔎", layout="wide", initial_sidebar_state="expanded")

SUSPECTS = {
    "s-ada": {"name": "Mara Vale", "age": 38, "role": "Event coordinator", "profile": "Kept the event running smoothly; knew every back corridor and service schedule."},
    "s-ellis": {"name": "Jonah Reed", "age": 44, "role": "Gallery owner", "profile": "The public face of the gallery, under pressure after a string of poor sales."},
    "s-noor": {"name": "Tess Arlow", "age": 29, "role": "Restoration artist", "profile": "Quiet, meticulous, and the last person seen near the east wing."},
    "s-finn": {"name": "Oren Pike", "age": 51, "role": "Security supervisor", "profile": "Had access to camera controls and insisted the system was working all night."},
}

EVIDENCE = [
    {"id": "e-chat-1", "type": "Chat", "title": "The closing shift", "time": "8:14 PM", "source": "Mara’s phone", "body": "Mara: East wing is clear. I left the side latch as requested.\nJonah: Got it. Please make sure the display case is logged before you go."},
    {"id": "e-chat-2", "type": "Chat", "title": "A late message", "time": "9:07 PM", "source": "Oren’s phone", "body": "Tess: Did you reset the east camera?\nOren: It resets on the hour. Nothing unusual on my end."},
    {"id": "e-img-1", "type": "Image", "title": "Dust on the plinth", "time": "9:20 PM", "source": "East gallery", "body": "A clean rectangular outline interrupts the dust on the velvet plinth."},
    {"id": "e-img-2", "type": "Image", "title": "The service corridor", "time": "8:42 PM", "source": "Staff corridor", "body": "A linen cart is parked beside the east wing entrance."},
    {"id": "e-cctv-1", "type": "CCTV", "title": "Camera 04: East wing", "time": "9:00–9:15 PM", "source": "Camera 04", "body": "9:00 — Corridor empty.\n9:08 — A figure in a pale event jacket enters, pushing a linen cart.\n9:12 — The cart exits; the figure checks the door.\n9:15 — Corridor empty."},
    {"id": "e-doc-1", "type": "Document", "title": "Shift access log", "time": "10:00 PM", "source": "Security desk", "body": "Door: East service\n20:41 — Staff key A-17\n21:08 — Door held open 04:12\n21:18 — Door closed\nThe service door can be held open without a second badge swipe."},
    {"id": "e-statement-1", "type": "Statement", "title": "Interview: Tess Arlow", "time": "Next morning", "source": "Interview room", "body": "Detective: When did you leave the east wing?\nTess: Before nine. I took the front stairs. The service corridor was already blocked by the linen cart.\nDetective: Did you have a reason to go back?\nTess: No. I handed my studio key to Mara at the reception desk."},
    {"id": "e-doc-2", "type": "Document", "title": "Inventory discrepancy", "time": "9:55 PM", "source": "Gallery inventory", "body": "Item: Silver astronomical dial\nExpected: 1\nFinal count: 0\nInitials: M.V.\nThe count was amended shortly before closing."},
    {"id": "e-statement-2", "type": "Statement", "title": "Interview: Oren Pike", "time": "Next morning", "source": "Interview room", "body": "Detective: Could Camera 04 have missed someone?\nOren: Only during the scheduled reset. That is 9:00 to 9:10, not after.\nDetective: Who can use the service key?\nOren: Coordinator and security. The spare is logged at reception."},
    {"id": "e-doc-3", "type": "Document", "title": "Repair receipt", "time": "11:30 AM", "source": "Rook & Thread Repairs", "body": "Item: Brass clasp\nPaid: cash\nCustomer: M. Vale\nThe clasp is compatible with the display case’s older locking mechanism."},
    {"id": "e-chat-3", "type": "Chat", "title": "A reminder to the team", "time": "6:33 PM", "source": "Staff group chat", "body": "Mara: Please leave the pale jackets on the linen cart after the reception.\nOren: Cart is by the east door."},
    {"id": "e-img-3", "type": "Image", "title": "The reception desk", "time": "8:10 PM", "source": "Reception", "body": "The spare key board is visible behind the reception counter; slot A-17 is empty."},
]

HINTS = [
    "Compare the inventory timing with the camera reset window.",
    "The linen cart links the corridor footage to the staff chat.",
    "Check who amended the count and who later bought a compatible clasp.",
]

for key, default in {
    "active": False, "scenario": "", "difficulty": "Medium", "tone": "Noir",
    "notes": "", "pinned": [], "viewed": [], "hints_used": 0,
    "wrong_attempts": 0, "resolved": False, "selected": None, "gave_up": False,
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

st.markdown("""
<style>
[data-testid="stAppViewContainer"] { background: #09111d; color: #e8edf4; }
[data-testid="stSidebar"] { background: #111b29; }
.block-container { max-width: 1180px; padding-top: 2rem; }
.case-card { background: #111d2d; border: 1px solid #26384d; border-radius: 14px; padding: 1rem; }
.gold { color: #e5b65d !important; }
.evidence { border-left: 3px solid #d7ad63; padding-left: 10px; }
</style>
""", unsafe_allow_html=True)

with st.sidebar:
    st.markdown("# 🔎 AI MYSTERY ROOM")
    st.caption("Fictional detective investigations")
    if st.button("Start a new case", use_container_width=True):
        for key, default in {"active": False, "scenario": "", "notes": "", "pinned": [], "viewed": [], "hints_used": 0, "wrong_attempts": 0, "resolved": False, "selected": None, "gave_up": False}.items():
            st.session_state[key] = default
        st.rerun()

if not st.session_state.active:
    st.markdown("## Enter the mystery")
    st.markdown("A unique story seed can begin a fictional investigation. This Streamlit edition includes a fully playable bundled case.")
    scenario = st.text_area("Story seed", height=120, max_chars=500, placeholder="A priceless painting disappeared during a rainy evening reception…")
    c1, c2 = st.columns(2)
    with c1:
        difficulty = st.selectbox("Difficulty", ["Easy", "Medium", "Hard"])
    with c2:
        tone = st.selectbox("Tone", ["Noir", "Cozy", "Thriller", "Comedic"])

    if st.button("OPEN CASE", type="primary", use_container_width=True):
        if len(scenario.strip()) < 10:
            st.error("Give the case a little more detail (at least 10 characters).")
        else:
            st.session_state.active = True
            st.session_state.scenario = scenario.strip()
            st.session_state.difficulty = difficulty
            st.session_state.tone = tone
            st.session_state.attempts_left = 3 if difficulty == "Easy" else 2 if difficulty == "Medium" else 1
            st.rerun()
    st.stop()

st.markdown("# THE MISSING ASTRONOMICAL DIAL")
st.markdown("At a private gallery reception, a valuable astronomical dial vanished from a locked display. The doors were watched, the guest list was short, and someone knew exactly when the east-wing camera would reset.")

tab_case, tab_evidence, tab_suspects, tab_resolution = st.tabs(["Case File", "Evidence Board", "Suspects", "Accuse"])

with tab_case:
    c1, c2 = st.columns([2, 1])
    with c1:
        st.markdown("### Briefing")
        st.info("Examine the records carefully: each clue is incomplete on its own.")
        st.markdown(f"**Your story seed:** {st.session_state.scenario}")
        st.markdown(f"**Difficulty:** {st.session_state.difficulty}  ·  **Tone:** {st.session_state.tone}")
    with c2:
        st.markdown("### Location")
        st.markdown("**The Bellwether Gallery**\n18 October 2026\n7:00 PM – 10:00 PM")
    st.markdown("### Investigator notes")
    st.session_state.notes = st.text_area("Private notes", value=st.session_state.notes, height=180)

with tab_evidence:
    types = ["All"] + sorted({item["type"] for item in EVIDENCE})
    selected_type = st.selectbox("Filter evidence", types)
    filtered = EVIDENCE if selected_type == "All" else [item for item in EVIDENCE if item["type"] == selected_type]
    for item in filtered:
        item_id = item["id"]
        with st.container(border=True):
            if item_id not in st.session_state.viewed:
                st.session_state.viewed.append(item_id)
            st.markdown(f"### {item['title']}  <span class='gold'>· {item['type']}</span>", unsafe_allow_html=True)
            st.caption(f"{item['time']}  |  {item['source']}")
            st.markdown(f"<div class='evidence'>{item['body'].replace(chr(10), '<br>')}</div>", unsafe_allow_html=True)
            pinned = item_id in st.session_state.pinned
            if st.button("Pinned" if pinned else "Pin evidence", key=f"pin-{item_id}"):
                if pinned:
                    st.session_state.pinned.remove(item_id)
                else:
                    st.session_state.pinned.append(item_id)
                st.rerun()

with tab_suspects:
    for suspect_id, suspect in SUSPECTS.items():
        with st.container(border=True):
            st.markdown(f"### {suspect['name']}")
            st.caption(f"{suspect['age']} · {suspect['role']}")
            st.write(suspect["profile"])

with tab_resolution:
    if st.session_state.resolved:
        st.success("The case has been resolved.")
    else:
        c1, c2 = st.columns([2, 1])
        with c1:
            if st.session_state.hints_used < 3:
                if st.button("Use a hint (-150 points)"):
                    st.session_state.hints_used += 1
                    st.rerun()
            else:
                st.caption("All three hints used")
            for index in range(st.session_state.hints_used):
                st.info(f"Hint {index + 1}: {HINTS[index]}")
        with c2:
            st.metric("Attempts remaining", st.session_state.attempts_left)
            st.metric("Hints used", st.session_state.hints_used)

    selected = st.selectbox("Choose your suspect", [None] + list(SUSPECTS.keys()), format_func=lambda value: "Select a suspect" if value is None else SUSPECTS[value]["name"])
    justification = st.text_area("Your justification", max_chars=600)
    b1, b2 = st.columns(2)
    with b1:
        if st.button("ACCUSE", type="primary", use_container_width=True, disabled=st.session_state.resolved):
            if selected is None:
                st.error("Choose exactly one suspect.")
            else:
                if selected == "s-ada":
                    st.session_state.resolved = True
                    st.session_state.selected = selected
                    st.rerun()
                else:
                    st.session_state.wrong_attempts += 1
                    st.session_state.attempts_left -= 1
                    if st.session_state.attempts_left <= 0:
                        st.session_state.resolved = True
                        st.session_state.selected = "s-ada"
                    st.rerun()
    with b2:
        if st.button("GIVE UP", use_container_width=True, disabled=st.session_state.resolved):
            st.session_state.resolved = True
            st.session_state.selected = "s-ada"
            st.session_state.gave_up = True
            st.rerun()

if st.session_state.resolved:
    culprit = SUSPECTS["s-ada"]
    st.markdown("---")
    st.markdown("## CASE RESOLUTION")
    if st.session_state.selected == "s-ada" and st.session_state.wrong_attempts == 0 and st.session_state.hints_used == 0:
        verdict = "Exact deduction"
    elif st.session_state.selected == "s-ada":
        verdict = "Correct deduction"
    else:
        verdict = "The investigation revealed the culprit"
    st.markdown(f"### **{verdict}: Mara Vale**")
    st.write("Mara Vale stole the astronomical dial. She amended the inventory count, used the linen cart to conceal the dial, knew about the camera reset, and later bought a compatible replacement clasp.")
    st.markdown("### Decisive evidence")
    st.write("- The inventory was amended under Mara’s initials before closing.")
    st.write("- Camera 04 captured the cart crossing during the reset and the next timestamp excludes Tess’s account of the corridor.")
    st.write("- Mara’s closing chat shows she knew the side latch and east-wing schedule.")
    st.write("- The receipt names M. Vale and the clasp fits the old display lock.")
    score = 0 if st.session_state.gave_up else max(0, 1000 - 150 * st.session_state.hints_used - 200 * st.session_state.wrong_attempts)
    st.metric("Case score", score)
