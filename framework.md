
# MarketMaker

## Introduction

MarketMaker is a web application that lets people make markets and trade with eachother, on whatever underlying they see fit to trade.
Traders join a "market", and can define new assets to trade. Traders can then fill a central order book with prices for the asset that they're trying to trade with eachother.
Users will be able to buy or sell lots of the assets that have been defined. When deemed necessary, the administrator of that selected market will be able to enter the settlement value of each particular asset, subsequent to which MarketMaker will suggest how much traders need to pay eachother to settle up their final debts to eachother.









## Game Logic


The traded assets are arbitrary, but they always have a price at which they can be bought or sold, and a size in which they are traded. An example might be--Bill's score on the upcoming math final. His friend friend Lenny might think that Bill will get approximately 85% score on his math test. He might make the market at 80 / 90, willing to buy 80 or sell 90. A size of 1 unit would imply settlement of 1 euro per differnce in score. 

Let's imagine that Anna hits Lenny's bid at 80, in size 1, because she thinks that Lenny is going to do poorly on the math test.

Anna has now sold the contract Bill-math-test at 80, and has a short position of -1.
Lenny is now long the same contract at 80, with a long position of 1.



Against all odds--Bill does quite well on thet test and scores a 90! The administrator would be able to settle all contracts of Bill-math-test at 90, which implies that Anna would have to pay Lenny 10 euros.



## Order Management system

The central functional element of MarketMaker is the orderbook. All traders in the market have access to the orderbook, and are able to both place new orders as well as trade on existing orders in the market. 























