using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class BuildPrototype
{
    [MenuItem("Soap/Build playable prototype")]
    public static void Build()
    {
        PlayerSettings.companyName="Soap Prototype";
        PlayerSettings.productName="The Soap - 3D Restaurant";
        PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=800;
        PlayerSettings.fullScreenMode=FullScreenMode.Windowed;
        PlayerSettings.runInBackground=true;
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        var prototype=new GameObject("Restaurant Prototype").AddComponent<SoapPrototype>();
        prototype.surfaceShader=Shader.Find("Standard");
        prototype.signageFont=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        EditorSceneManager.SaveScene(scene,"Assets/Restaurant.unity");
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes=new[]{"Assets/Restaurant.unity"},locationPathName="Build/SoapRestaurant.exe",
            target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development
        });
        if(result.summary.result!=BuildResult.Succeeded)throw new Exception("Build failed: "+result.summary.result);
        Debug.Log("SOAP_BUILD_SUCCESS");
    }
}
