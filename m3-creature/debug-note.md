# 卡點紀錄：移動軌跡逐漸變長，線條卻漏畫

日期：2026-10-22。這是 Codex 在本輪開發與 Chrome 測試實際遇到的問題，Luna 尚需親自操作確認；不是虛構為 Luna 已自行除錯的經驗。

## 想要的效果與實際問題

想用一條持續增加的線記錄借殼地貌的移動路徑，方便比較循濕反應開啟與關閉時的差異。第一版畫面能執行，但軌跡沒有正常延長，瀏覽器反覆出現：

```text
THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.
```

## 原因與實際試過的方法

1. 第一版每增加一個軌跡點，就在同一個 `BufferGeometry` 呼叫 `setFromPoints(trailPoints)`。
2. 實際查看 Chrome console 後，發現既有頂點緩衝區未隨點數增加而擴大；畫面有動，不代表軌跡功能正常。
3. 改成預先配置最多 1400 點的 `Float32Array`，只更新已使用的座標，透過 `setDrawRange` 指定要畫幾個點。超過上限時移除最早的點。
4. 在新的 Chrome 分頁執行修改後版本，檢查軌跡已顯示、計時與取水仍正常，並重新查看 console：查到的 warning/error 清單為空。

## 目前結果與本人待完成的部分

- 已完成程式修正與瀏覽器確認；實際截圖見 [preview.png](preview.png)。截圖展示修正後畫面，不冒充修正前的 console 截圖。
- Luna 請親自用「顯示移動軌跡」與「循濕反應」開關操作一次，確認軌跡看得清楚，並能用自己的話說明這個卡點。
- 不代表所有生物動作已符合想像；石塊交換仍為運動學示意，沒有石塊剛體碰撞。

AI：Codex；2026-10-22；採用範圍：實際除錯、修正、Chrome 操作與紀錄。未代寫本人反思或宣稱 Luna 已完成個人驗證。
