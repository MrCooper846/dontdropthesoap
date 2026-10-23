using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
public static class BuildMultiplayer {
[MenuItem("Soap/Build multiplayer restaurant")]
public static void Build(){PlayerSettings.companyName="Soap";PlayerSettings.productName="The Soap Multiplayer";PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=800;PlayerSettings.fullScreenMode=FullScreenMode.Windowed;PlayerSettings.runInBackground=true;
var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);var client=new GameObject("Authoritative Restaurant Client").AddComponent<UnityRestaurantClient>();client.surfaceShader=Shader.Find("Standard");EditorSceneManager.SaveScene(scene,"Assets/MultiplayerRestaurant.unity");var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/MultiplayerRestaurant.unity"},locationPathName="Build/SoapMultiplayer.exe",target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development});if(result.summary.result!=BuildResult.Succeeded)throw new Exception("Build failed: "+result.summary.result);Debug.Log("SOAP_MULTIPLAYER_BUILD_SUCCESS");}
}
