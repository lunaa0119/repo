# 借殼地貌：五種移動演算法候選比較

查閱日期：2026-10-22。依 Luna 要求搜尋 GitHub，核對 README、原始碼、專案資訊與授權。只做研究比較，未安裝或執行這五個專案，未移植生物程式。優缺點、難度與適合度是 AI 依目前設定所做的工程判斷，不是實測排名或 Luna 的設計理由。

## 比較依據

- 本體小而薄、含水，藏在碎石間，前收後放碎石；地表主要只見碎石移動。
- 緩慢、不規則地移動，能感知濕氣，朝相對較潮濕方向前進。
- 長乾季少雨，土壤仍濕潤，各處濕度不同。
- 接觸吸水建材後，在附著期間吸完其中的水，再放回環境。
- 感知器官的構造延後討論。以下感測點是動畫計算用的取樣位置，不代表已決定器官數量或長相。
- 以下五種是 Flow Field Following 之外的候選；它們主要處理方向與速度，碎石交換、薄膜動作和取水仍需另行實作。

## 1. Braitenberg 感測訊號控制轉向

- 原理：以不同位置的訊號經簡單連線、增益或抑制，影響左右動作，產生靠近或遠離刺激的行為。
- 本物種應用提案：左右兩處取樣濕度，使用接線或等效轉向規則朝較濕一側緩慢彎轉；限制速度與轉向幅度，搭配少量方向擾動。
- 優點：規則少、直覺、容易說明感知與動作的關係；只取附近訊號；可做平滑轉向。
- 缺點：不同接線會造成追逐或逃離，增益需調整；相同訊號或局部峰值可能讓牠停住或繞圈；原範例的輪式動作需改成適合薄膜生物的移動。
- 概念移植難度估計：低至中。
- GitHub：[Mostly1sAnd0s/vehicles](https://github.com/Mostly1sAnd0s/vehicles)。已讀 `src/actuators.js`，核對感測值經權重、極性與曲線轉為動作輸出；MIT，JavaScript。
- 補充簡單教學來源：[hmc-alpaqa/braitenberg-vehicles](https://github.com/hmc-alpaqa/braitenberg-vehicles)，已讀 `js/Vehicles/Vehicle3.js` 與 MotorController；該 repo 本次未查到整體授權檔，只列概念閱讀來源，不列為已確認可直接重用的程式。

## 2. Run-and-Tumble：帶偏向的前進／轉向搜尋

- 原理來源為細菌趨化模型，交替前進與改變方向，由環境訊號影響狀態。
- 本物種的簡化應用提案：比較目前和稍早的濕度；變濕時較常保持方向，變乾時較常重新選方向。將原本瞬間轉向改成漸轉，是額外動畫設計。
- 優點：使用濕度變化與短期記憶，不必直接取得濕源座標；自然帶有試探與不規則性。
- 缺點：搜尋效率不穩定；濕度差小或訊號有雜訊時易徘徊；原始轉向可能太突然，需要平滑化。研究模型包含生化網路，不適合整套搬進今日原型。
- 概念移植難度估計：中；完整研究模型較高。
- GitHub：[nvladimus/rapidcell](https://github.com/nvladimus/rapidcell)。已讀 README、`RapidCell1.4.2/src/Cell2D.java` 與 `Model.java` 的環境濃度、Run/Tumble 狀態更新；MIT，模擬核心 Java。原專案不是濕氣感知或本物種的生理證據。

## 3. Physarum 黏菌模型的三方向感測轉向

- 原理：在前方、左前方、右前方取樣訊號，依大小比較決定繼續前進、左轉、右轉或加入隨機轉向。
- 本物種應用提案：將原程式取樣的軌跡強度換成外部濕度場，保留有限轉向速度；不自動採用原專案的軌跡沉積與群體網絡。
- 優點：規則可直接讀懂，局部感知與不規則轉向都清楚；訊號改變能使移動方向改變；適合小型實驗。
- 缺點：感測距離、角度與轉向速度需搭配調整；可能繞圈或錯過感測範圍外的濕區；原專案為 Unity/compute shader，需要改寫移動邏輯接到現有模型。
- 概念移植難度估計：中。
- GitHub：[SebLague/Slime-Simulation](https://github.com/SebLague/Slime-Simulation)。已讀 [SlimeSim.compute](https://github.com/SebLague/Slime-Simulation/blob/main/Assets/Scripts/Slime/SlimeSim.compute) 的 `sense`、三方向比較與角度更新；專案授權 GPL-3.0。採用具體程式前需再核對相應授權與採用範圍。

## 4. Wander：有連續性的隨機遊走

- 原理：沿用上一刻的轉向狀態，再逐次加上小幅隨機變化。
- 本物種應用提案：控制低速、緩慢彎轉，當濕度差不明顯時作探索動作；可與循濕轉向混合。
- 優點：規則少、方便控制曲折程度；能避免每一瞬間重新選方向的抖動感；適合先建立自然移動。
- 缺點：單獨使用不會偏向較潮濕處，不能完整表現 Luna 的濕氣感知設定；避障、邊界及濕度偏向需另外加入。
- 概念移植難度估計：低。
- GitHub：[meshula/OpenSteer](https://github.com/meshula/OpenSteer)，參照 [SteerLibrary.h](https://github.com/meshula/OpenSteer/blob/master/include/OpenSteer/SteerLibrary.h) 的 `steerForWander`。C++；檔頭有 MIT 授權文字，GitHub 的 license API 本次僅回傳 NOASSERTION，故以實際檔頭為核對依據。

## 5. Artificial Potential Field：人工勢場

- 原理：將目標的吸引與障礙的排斥合成環境中的勢能，沿較低勢能方向移動。
- 本物種應用提案：研究用局部濕度偏好形成吸引，對不能穿越的大障礙物產生排斥；可拿來搬運的小碎石不應一律當障礙。
- 優點：可同時處理前往目標與避障；吸引、排斥強度方便調整；參考專案文件與範例較完整、社群較大。
- 缺點：可能陷在局部低點或來回震盪，無法保證一定走到目標；原範例需要目標與障礙座標，並非僅靠局部濕氣；其八方向格點路徑需要額外平滑，才能符合緩慢彎轉。
- 概念移植難度估計：中至高。
- GitHub：[AtsushiSakai/PythonRobotics](https://github.com/AtsushiSakai/PythonRobotics)，已讀 [potential_field_planning.py](https://github.com/AtsushiSakai/PythonRobotics/blob/master/PathPlanning/PotentialFieldPlanning/potential_field_planning.py) 的吸引、排斥、格點選擇與振盪偵測；MIT，Python。API 未辨識授權，但已讀實際 LICENSE 確認。

## 專案現況快照

以下為 GitHub API 本次查詢結果。星數與最後推送時間會變動；星數不等於演算法正確性、程式品質或移植後效果。

| 參考專案 | Stars | 最後推送（UTC） | 核對狀態 |
| --- | ---: | --- | --- |
| Mostly1sAnd0s/vehicles | 1 | 2026-09-14 | 小型近期專案，不宣稱已成熟穩定 |
| nvladimus/rapidcell | 3 | 2018-09-19 | 研究參考，更新較舊 |
| SebLague/Slime-Simulation | 1527 | 2023-03-09 | 有一定社群關注，更新較舊 |
| meshula/OpenSteer | 375 | 2023-03-31 | 經典控制方法參考，更新較舊 |
| AtsushiSakai/PythonRobotics | 30762 | 2026-10-21 | 社群與文件較完整，仍需檢查所用範例 |

## AI 建議與下一步

- 優先做 Braitenberg 或三方向感測的小實驗，驗證「移動緩慢但確實往較濕處偏移」，不把感測點數量當成器官設定。
- 若要更曲折的探索感，可比較 Run-and-Tumble；Wander 可作輔助。
- APF 留作需要大障礙避讓時的候選，避免為今日原型加入不必要的環境資料需求。
- 這些是 AI 提案，未替 Luna 選定，也未代寫本人反思或設計理由。今天仍需本人閱讀選擇、實際操作與卡點證據，不能把本研究當作作業全部完成。

AI 揭露：Codex；2026-10-22；Prompt 摘要：到 GitHub 找五種其他演算法，說明每種優缺點；採用範圍：搜尋、原碼與授權／現況核對、依 Luna 設定比較候選方法、研究文件。沒有下載依賴、安裝套件、執行這些專案或修改生物程式。本檔僅存本機，未提交或推送。
