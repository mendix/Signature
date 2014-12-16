#Signature
Complete any delivery service App with this Signature widget.
This widget allows you to save a signature to an attribute.

## Contributing
For more information on contributing to this repository visit [Contributing to a GitHub repository](https://world.mendix.com/display/howto50/Contributing+to+a+GitHub+repository)!

## Features
* Record signature in an attribute
* Customizable size, pencolor and grid
* Reset button to delete signature

## Configuration
Add the widget to a dataview. Connect the data URL property to an unlimited String attribute of the dataview context object.

### Properties
* *Pen color* - HTML color code of the pen.
* *Pen size* - Size of the pen in pixels.
* *Signature timeout* - Amount of milliseconds the widget will wait after the user has stopped writing before saving the signature.
* *Canvast height* - Height of writable area in pixels.
* *Canvas width* - Width of writable area in pixels.
* *Show background grid* - When set to yes, a grid is shown in the background of the writable area.
* *Grid X* - The distance in pixels between gridlines in the horizontal direction.
* *Grid Y* - The distance in pixels between gridlines in the vertical direction.
* *Grid color* - HTML color code of the grid
* *Grid border width* - Width of canvas border in pixels
* *Reset caption* - Caption that is shown on the button with which you can remove an existing signature.
* *Data URL* - Unlimited string attribute that is used to save the signature.
