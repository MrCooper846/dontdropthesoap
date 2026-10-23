using System;
using System.Collections;
using UnityEngine;

// Standalone feel prototype: no connection to live wallets or multiplayer.
public class SoapPrototype : MonoBehaviour
{
    public Shader surfaceShader;
    public Font signageFont;
    public CharacterController player;
    public Rigidbody tray;
    public Transform hand, prep, delivery;
    Camera cam;
    Transform visual, food;
    Transform[] legs = new Transform[2];
    Vector3 velocity;
    float yaw, zoom = 9, cooking, noticeUntil;
    bool carrying, filled, help = true;
    int earned, meals;
    string notice = "Welcome to your first shift. Find the yellow tray.";
    Material cream, dark, orange, wood, metal, green, yellow;
    GUIStyle title, body, small, big;
    bool smoke;

    void Start()
    {
        Application.targetFrameRate = 60;
        signageFont=Font.CreateDynamicFontFromOSFont("Arial",64);
        cream = Mat("Warm plaster", new Color(.75f,.76f,.63f));
        dark = Mat("Charcoal", new Color(.12f,.18f,.17f));
        orange = Mat("Prison orange", new Color(.92f,.40f,.12f));
        wood = Mat("Timber", new Color(.40f,.25f,.14f));
        metal = Mat("Steel", new Color(.48f,.59f,.58f));
        green = Mat("Sage", new Color(.28f,.44f,.34f));
        yellow = Mat("Interaction yellow", new Color(.96f,.78f,.24f));
        BuildWorld();
        cam = Camera.main;
        cam.backgroundColor = new Color(.12f,.20f,.22f);
        cam.fieldOfView = 48;
        noticeUntil = Time.time + 8;
        smoke = Array.IndexOf(Environment.GetCommandLineArgs(), "--smoke-test") >= 0;
        if (smoke) StartCoroutine(SmokeTest());
    }

    Material Mat(string name, Color c)
    {
        var m = new Material(surfaceShader); m.name=name; m.color=c;
        m.SetFloat("_Glossiness", .18f); return m;
    }
    GameObject Box(string name, Vector3 p, Vector3 s, Material m, Transform parent = null)
    {
        var g=GameObject.CreatePrimitive(PrimitiveType.Cube); g.name=name;
        g.transform.SetParent(parent, false); g.transform.localPosition=p;
        g.transform.localScale=s; g.GetComponent<Renderer>().sharedMaterial=m; return g;
    }
    void Label(string text, Vector3 p, float size = .38f)
    {
        var g=new GameObject(text); g.transform.position=p; g.transform.rotation=Quaternion.Euler(90,0,0);g.transform.localScale=Vector3.one*.18f;
        var t=g.AddComponent<TextMesh>(); t.text=text; t.anchor=TextAnchor.MiddleCenter;
        t.font=signageFont;g.GetComponent<MeshRenderer>().sharedMaterial=signageFont.material;
        t.characterSize=size; t.fontSize=64; t.color=new Color(.88f,.91f,.76f);
    }
    void Wall(float x,float z,float w,float d) { Box("Wall",new Vector3(x,.85f,z),new Vector3(w,1.7f,d),cream); }
    Transform Counter(string name, Vector3 p, Material top)
    {
        var b=Box(name,p+Vector3.up*.5f,new Vector3(2,1,1),green);
        Box(name+" top",p+Vector3.up*1.04f,new Vector3(2.15f,.12f,1.12f),top); return b.transform;
    }
    void BuildWorld()
    {
        RenderSettings.ambientLight=new Color(.65f,.71f,.69f);
        RenderSettings.fog=true; RenderSettings.fogColor=new Color(.12f,.20f,.22f); RenderSettings.fogDensity=.012f;
        var light=new GameObject("Afternoon light").AddComponent<Light>(); light.type=LightType.Directional;
        light.intensity=1.25f; light.shadows=LightShadows.Soft; light.transform.rotation=Quaternion.Euler(48,-25,0);
        Box("Foundation",new Vector3(0,-.25f,1),new Vector3(26,.5f,24),dark);
        Box("Dining floor",new Vector3(5,-.015f,-2),new Vector3(14,.03f,16),wood);
        Box("Kitchen floor",new Vector3(-7,.005f,0),new Vector3(10,.04f,10),metal);
        Box("Back corridor",new Vector3(0,.01f,6),new Vector3(25,.04f,2),green);
        for(int x=-11;x<=11;x+=2) for(int z=-9;z<=11;z+=2)
            Box("Floor joint",new Vector3(x,.035f,z),new Vector3(.025f,.008f,1.95f),dark);
        Wall(0,12.8f,26,.4f); Wall(-12.8f,1,.4f,24); Wall(12.8f,1,.4f,24); Wall(0,-10.8f,26,.4f);
        // Kitchen wall and physical serving hatch; open doorway on its east side.
        Wall(-10,5,5.5f,.3f); Wall(-3.5f,5,2.5f,.3f);
        Wall(-2,2.5f,.3f,5); Wall(-2,-4,.3f,2);
        Wall(-10,-5,5.5f,.3f); Wall(-3.5f,-5,2.5f,.3f);
        Counter("Serving hatch",new Vector3(-6,-.0f,-5),metal);
        // Back rooms have door gaps into the shared corridor.
        Wall(-9,9,.3f,5.8f); Wall(-3,9,.3f,5.8f); Wall(5,9,.3f,5.8f);
        Wall(-11.5f,7,2.4f,.3f); Wall(-7.5f,7,2.5f,.3f);
        Wall(-1.5f,7,2.5f,.3f); Wall(3.5f,7,2.5f,.3f);
        Wall(6.5f,7,2.5f,.3f); Wall(11.5f,7,2.5f,.3f);
        Label("KITCHEN",new Vector3(-7,.07f,3.7f)); Label("DINING",new Vector3(6,.07f,3));
        Label("WASH UP",new Vector3(-11,.07f,10),.25f); Label("OFFICE",new Vector3(1,.07f,10));
        Label("STOCK",new Vector3(9,.07f,10)); Label("BAR",new Vector3(7,.07f,-8));
        Counter("Sink",new Vector3(-11,0,11.6f),metal);
        Counter("Office desk",new Vector3(1,0,11.5f),wood);
        Box("Noodle vault",new Vector3(3.8f,.7f,11.5f),new Vector3(1,1.4f,1),metal);
        for(int i=0;i<3;i++) Box("Supply crates",new Vector3(7+i*1.6f,.5f,11.5f),new Vector3(1.3f,1,1),wood);
        Counter("Bar counter",new Vector3(7,0,-8.8f),metal);
        prep=Counter("Preparation station",new Vector3(-9,0,1),metal);
        Box("Chopping board",new Vector3(-9,1.15f,1),new Vector3(1.1f,.12f,.7f),wood);
        for(int i=0;i<3;i++) Box("Ingredients",new Vector3(-9.5f+i*.45f,1.3f,1),new Vector3(.25f,.2f,.2f),orange);
        Counter("Cooker",new Vector3(-9,0,-1),dark);
        Label("PREP / HOLD F",new Vector3(-7,.07f,1),.23f);
        var stand=Counter("Tray collection",new Vector3(-.1f,0,-3),wood);
        var tg=new GameObject("Yellow tray");tg.transform.position=new Vector3(-.1f,1.2f,-3);
        Box("Tray base",Vector3.zero,new Vector3(.85f,.10f,.58f),yellow,tg.transform);
        tray=tg.AddComponent<Rigidbody>(); tray.mass=1; tray.linearDamping=.7f; tray.angularDamping=.8f;
        tray.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;
        // Raised tray edges make this a real rigid object rather than a flat icon.
        Box("Tray edge",new Vector3(0,.08f,.27f),new Vector3(.85f,.12f,.04f),yellow,tg.transform);
        Box("Tray edge",new Vector3(0,.08f,-.27f),new Vector3(.85f,.12f,.04f),yellow,tg.transform);
        Box("Tray edge",new Vector3(.40f,.08f,0),new Vector3(.04f,.12f,.5f),yellow,tg.transform);
        Box("Tray edge",new Vector3(-.40f,.08f,0),new Vector3(.04f,.12f,.5f),yellow,tg.transform);
        food=new GameObject("Noodle bowl").transform; food.SetParent(tg.transform,false); food.localPosition=new Vector3(0,.11f,0);
        var bowl=GameObject.CreatePrimitive(PrimitiveType.Sphere); bowl.transform.SetParent(food,false);
        bowl.transform.localScale=new Vector3(.38f,.16f,.38f); bowl.GetComponent<Renderer>().sharedMaterial=cream;
        Destroy(bowl.GetComponent<Collider>());
        for(int i=0;i<6;i++) { var n=Box("Noodles",new Vector3((i%3-1)*.085f,.08f,(i/3-.5f)*.09f),new Vector3(.035f,.025f,.16f),yellow,food); Destroy(n.GetComponent<Collider>()); }
        food.gameObject.SetActive(false);
        delivery=Counter("Customer table",new Vector3(6,0,-1),wood);
        Label("TABLE 1 / DELIVER",new Vector3(6,.07f,-2.4f),.24f);
        for(int i=0;i<3;i++) Counter("Dining table",new Vector3(6+i%2*4,0,-5+i/2*5),wood);
        var customer=GameObject.CreatePrimitive(PrimitiveType.Capsule); customer.name="Waiting customer";
        customer.transform.position=new Vector3(6,.9f,.3f); customer.transform.localScale=new Vector3(.65f,.9f,.65f);
        customer.GetComponent<Renderer>().sharedMaterial=green;
        var pg=new GameObject("Prisoner"); pg.transform.position=new Vector3(1,.12f,-4.8f);
        player=pg.AddComponent<CharacterController>(); player.height=1.8f; player.center=new Vector3(0,.9f,0); player.radius=.32f;
        player.stepOffset=.25f; player.skinWidth=.025f;
        visual=new GameObject("Prisoner visual").transform; visual.SetParent(pg.transform,false);
        Box("Uniform",new Vector3(0,1.05f,0),new Vector3(.6f,.7f,.38f),cream,visual);
        for(int i=0;i<4;i++) { var stripe=Box("Prison stripes",new Vector3(0,.81f+i*.16f,-.005f),new Vector3(.61f,.065f,.39f),dark,visual); Destroy(stripe.GetComponent<Collider>()); }
        var head=GameObject.CreatePrimitive(PrimitiveType.Sphere); head.transform.SetParent(visual,false); head.transform.localPosition=new Vector3(0,1.63f,0);
        head.transform.localScale=Vector3.one*.44f; head.GetComponent<Renderer>().sharedMaterial=orange;
        Destroy(head.GetComponent<Collider>());
        for(int i=0;i<2;i++) {
            Box("Eye",new Vector3(i==0?-.085f:.085f,1.67f,.205f),new Vector3(.055f,.055f,.035f),dark,visual);
            var arm=Box("Arm",new Vector3(i==0?-.4f:.4f,1.04f,.15f),new Vector3(.16f,.5f,.18f),cream,visual);
            arm.transform.localRotation=Quaternion.Euler(-35,0,0);
        }
        for(int i=0;i<2;i++) { legs[i]=Box("Leg",new Vector3(i==0?-.17f:.17f,.38f,0),new Vector3(.22f,.65f,.24f),dark,visual).transform; }
        foreach(var c in pg.GetComponentsInChildren<Collider>()) if(c!=player) Destroy(c);
        hand=new GameObject("Tray carry point").transform; hand.SetParent(pg.transform,false); hand.localPosition=new Vector3(0,1.05f,.68f);
        cam=new GameObject("Main Camera").AddComponent<Camera>(); cam.tag="MainCamera"; cam.gameObject.AddComponent<AudioListener>();
    }
    void Update()
    {
        if(smoke) return;
        var axes=new Vector2(Input.GetAxisRaw("Horizontal"),Input.GetAxisRaw("Vertical"));
        Move(axes,Time.deltaTime,Input.GetKey(KeyCode.LeftShift));
        if(Input.GetMouseButton(1)) yaw+=Input.GetAxis("Mouse X")*3;
        zoom=Mathf.Clamp(zoom-Input.mouseScrollDelta.y*.7f,5,13);
        if(Input.GetKeyDown(KeyCode.E)) Interact();
        if(Input.GetKeyDown(KeyCode.Q)&&carrying) Drop();
        if(Input.GetKeyDown(KeyCode.R)) ResetTray();
        if(Input.GetKeyDown(KeyCode.H)) help=!help;
        if(Input.GetKeyDown(KeyCode.Escape)) Application.Quit();
        Work(Input.GetKey(KeyCode.F),Time.deltaTime);
    }
    void Move(Vector2 axes,float dt,bool run=false)
    {
        var direction=Quaternion.Euler(0,yaw,0)*new Vector3(axes.x,0,axes.y).normalized;
        if(player.isGrounded&&velocity.y<0) velocity.y=-2;
        velocity.y-=20*dt;
        player.Move((direction*(run?5.5f:3.7f)+velocity)*dt);
        if(direction.sqrMagnitude>.01f) player.transform.rotation=Quaternion.Slerp(player.transform.rotation,Quaternion.LookRotation(direction),dt*14);
        for(int i=0;i<2;i++) legs[i].localRotation=Quaternion.Euler(direction.sqrMagnitude>.01f?Mathf.Sin(Time.time*12+i*Mathf.PI)*24:0,0,0);
    }
    void LateUpdate()
    {
        if(!cam||!player)return;
        var target=player.transform.position+Vector3.up*.9f;
        var desired=target+Quaternion.Euler(0,yaw,0)*new Vector3(0,zoom*.85f,-zoom);
        cam.transform.position=Vector3.Lerp(cam.transform.position,desired,1-Mathf.Exp(-Time.deltaTime*9));
        cam.transform.LookAt(target);
    }
    float Distance(Vector3 p) { var v=player.transform.position-p; v.y=0; return v.magnitude; }
    public void Interact()
    {
        if(carrying&&filled&&Distance(delivery.position)<2.25f) { filled=false;food.gameObject.SetActive(false);earned+=10;meals++;Notice("Meal delivered! +10 prototype noodles. Make another."); }
        else if(!carrying&&Distance(tray.position)<2.1f) { carrying=true;tray.isKinematic=true;foreach(var c in tray.GetComponentsInChildren<Collider>()) c.enabled=false;tray.transform.SetParent(hand,false);tray.transform.localPosition=Vector3.zero;tray.transform.localRotation=Quaternion.identity;Notice("Tray collected. Take it to the kitchen preparation bench."); }
    }
    public void Work(bool held,float dt)
    {
        if(held&&carrying&&!filled&&Distance(prep.position)<2.3f) { cooking+=dt; if(cooking>=3) {filled=true;cooking=0;food.gameObject.SetActive(true);Notice("Noodle bowl ready. Carry it to the customer at Table 1.");} }
        else cooking=Mathf.Max(0,cooking-dt*2);
    }
    public void Drop()
    {
        carrying=false;cooking=0;tray.transform.SetParent(null,true);foreach(var c in tray.GetComponentsInChildren<Collider>())c.enabled=true;
        tray.isKinematic=false;tray.linearVelocity=player.transform.forward*1.2f;tray.angularVelocity=new Vector3(0,.6f,.2f);Notice("Tray dropped. Pick it back up with E, or use R to reset it.");
    }
    void ResetTray()
    {
        carrying=false;cooking=0;tray.isKinematic=true;tray.transform.SetParent(null,true);
        var reset=new Vector3(-.1f,1.25f,-3);
        tray.transform.SetPositionAndRotation(reset,Quaternion.identity);tray.position=reset;tray.rotation=Quaternion.identity;
        foreach(var c in tray.GetComponentsInChildren<Collider>())c.enabled=true;
        Physics.SyncTransforms();tray.isKinematic=false;tray.linearVelocity=Vector3.zero;tray.angularVelocity=Vector3.zero;tray.WakeUp();
        filled=false;food.gameObject.SetActive(false);Notice("Tray reset to its collection counter.");
    }
    void Notice(string s){notice=s;noticeUntil=Time.time+7;}
    void OnGUI()
    {
        GUI.matrix=Matrix4x4.Scale(Vector3.one*(Screen.height/800f));float w=Screen.width*800f/Screen.height;
        if(title==null){var hudFont=Font.CreateDynamicFontFromOSFont("Segoe UI",18);title=new GUIStyle(GUI.skin.label){font=hudFont,fontSize=21,fontStyle=FontStyle.Bold,clipping=TextClipping.Clip};body=new GUIStyle(GUI.skin.label){font=hudFont,fontSize=18,wordWrap=true};small=new GUIStyle(GUI.skin.label){font=hudFont,fontSize=15,wordWrap=true};big=new GUIStyle(body){fontSize=22,fontStyle=FontStyle.Bold};}
        GUI.color=new Color(.08f,.13f,.13f,.94f);GUI.DrawTexture(new Rect(16,16,430,help?185:77),Texture2D.whiteTexture);GUI.color=Color.white;
        GUI.Label(new Rect(30,25,410,40),"THE SOAP / RESTAURANT 3D",title);
        GUI.Label(new Rect(30,64,410,32),"FEEL PROTOTYPE  •  "+meals+" meals  /  "+earned+" noodles",small);
        if(help)GUI.Label(new Rect(30,96,400,105),"WASD / arrows: walk   Shift: run\nE: pick up / deliver   Q: drop tray\nHold F: prepare food   R: reset tray\nRight-drag: orbit   Wheel: zoom   H: help   Esc: quit",small);
        string goal=!carrying?"1  COLLECT A TRAY":!filled?"2  PREPARE A MEAL":"3  DELIVER TO TABLE 1";
        string prompt=!carrying&&Distance(tray.position)<2.1f?"E  Pick up tray":carrying&&!filled&&Distance(prep.position)<2.3f?"HOLD F  Prepare noodles":carrying&&filled&&Distance(delivery.position)<2.25f?"E  Serve customer":!carrying?"Find the yellow tray beside the kitchen entrance.":!filled?"Walk to the preparation board inside the kitchen.":"Carry the meal to Table 1 in the dining room.";
        GUI.color=new Color(.08f,.13f,.13f,.94f);GUI.DrawTexture(new Rect(w/2-290,650,580,132),Texture2D.whiteTexture);GUI.color=new Color(.98f,.82f,.32f);
        GUI.Label(new Rect(w/2-270,659,540,30),goal,big);GUI.color=Color.white;GUI.Label(new Rect(w/2-270,695,540,45),prompt,body);
        if(cooking>0){GUI.color=new Color(.95f,.70f,.2f);GUI.DrawTexture(new Rect(w/2-270,752,540*cooking/3,9),Texture2D.whiteTexture);GUI.color=Color.white;}
        if(Time.time<noticeUntil)GUI.Label(new Rect(w/2-280,220,560,70),notice,body);
        GUI.Label(new Rect(w-320,20,300,50),"Local single-player prototype\nEarnings do not affect your live wallet.",small);
    }
    bool routeFailed;
    IEnumerator WalkTo(float x,float z)
    {
        var target=new Vector3(x,0,z);var deadline=Time.time+8;
        while(Distance(target)>.10f) {
            if(Time.time>deadline){routeFailed=true;Debug.LogError("SOAP_ROUTE_FAIL: blocked at "+player.transform.position+" heading to "+target);Application.Quit(1);yield break;}
            var d=target-player.transform.position;Move(new Vector2(d.x,d.z),Time.deltaTime);yield return null;
        }
    }
    IEnumerator SmokeTest()
    {
        yield return new WaitForSeconds(.8f);
        try {
            var start=player.transform.position;Move(Vector2.right,.2f);if(player.transform.position.x<=start.x+.3f)throw new Exception("Walking failed");
            for(int i=0;i<250;i++) Move(Vector2.right,1f/60);
            if(player.transform.position.x>12.5f)throw new Exception("Wall collision failed");
            player.enabled=false;player.transform.position=new Vector3(-.1f,.12f,-4.3f);player.enabled=true;Physics.SyncTransforms();Interact();if(!carrying)throw new Exception("Pickup failed");
            player.enabled=false;player.transform.position=new Vector3(-7.6f,.12f,1);player.enabled=true;Physics.SyncTransforms();Work(true,3.1f);if(!filled)throw new Exception("Workstation failed");
            player.enabled=false;player.transform.position=new Vector3(4.5f,.12f,-1);player.enabled=true;Physics.SyncTransforms();Interact();if(earned!=10||meals!=1||filled)throw new Exception("Delivery failed");
            Drop();if(tray.isKinematic||carrying)throw new Exception("Drop failed");
            Debug.Log("SOAP_SMOKE: walking, wall collision, pickup, workstation, delivery and physical drop PASS");
            ResetTray();player.enabled=false;player.transform.position=new Vector3(1,.12f,-4.8f);player.enabled=true;
        }catch(Exception e){Debug.LogError("SOAP_SMOKE_FAIL: "+e);Application.Quit(1);yield break;}
        // Exercise the actual collision-constrained route as well as isolated actions.
        yield return WalkTo(1.3f,-4.2f);Interact();
        Debug.Log("SOAP_ROUTE_PICKUP: carrying="+carrying+" tray="+tray.position+" player="+player.transform.position);
        yield return WalkTo(1.6f,-4.2f);yield return WalkTo(1.6f,-1.8f);
        yield return WalkTo(-3.2f,-1.8f);yield return WalkTo(-7.4f,-1.8f);yield return WalkTo(-7.4f,1);
        Work(true,3.1f);
        Debug.Log("SOAP_ROUTE_PREP: filled="+filled+" distance="+Distance(prep.position));
        yield return WalkTo(-7.4f,-1.8f);yield return WalkTo(-3.2f,-1.8f);yield return WalkTo(1.6f,-1.8f);
        yield return WalkTo(3.7f,-2.8f);yield return WalkTo(4.5f,-1);Interact();
        if(routeFailed||earned!=20){Debug.LogError("SOAP_ROUTE_FAIL: meal not completed; earned="+earned+" carrying="+carrying+" filled="+filled+" distance="+Distance(delivery.position));Application.Quit(1);yield break;}
        Debug.Log("SOAP_ROUTE: collection, kitchen doorway, preparation, carrying and dining delivery PASS");
        ResetTray();player.enabled=false;player.transform.position=new Vector3(1,.12f,-4.8f);player.enabled=true;
        yield return new WaitForSeconds(1);
        ScreenCapture.CaptureScreenshot("D:/Unity/Projects/Soap3D/Build/prototype-preview.png");
        yield return new WaitForSeconds(1);Application.Quit(0);
    }
}
